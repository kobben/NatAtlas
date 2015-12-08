/**
 * DataLoader.js:
 *
 * Data Loader for attribute and geodata for the NatAtlas project
 *
 * Licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 License.
 * see http://creativecommons.org/licenses/by-nc-sa/3.0/
 *
 * @author Barend Köbben - b.j.kobben@utwente.nl
 * Basic structure based on Mike Bostock's D3 example DataLoader
 *
 * loads data from various formats and returns in unified format
 * geoData => returned as array of n objects, each having a GeoJson geometry and a
 *   properties object = nested list of attribute key-value pairs
 * attribData => returned as d3.map of objects with key = FK,
 *   value = nested list of attribute key-value pairs
 *
 * Depends on Messages.js for error reporting!
 *
 * @version 1.0 [November 2015]
 * first version supports
 * geoData: geojson, topojson
 * attribData: geojson, topojson, csv
 *
 */


DataLoader = function () {
    var loadedCallback = null;
    var toload = {};
    var dataLoaded = {};
    var loaded = function (name, d) {
        delete toload[name];
        dataLoaded[name] = d;
        return notifyIfAll();
    };
    var notifyIfAll = function () {
        if ((loadedCallback != null) && d3.keys(toload).length === 0) {
            loadedCallback(dataLoaded);
        }
    };
    var loader = {
        geometries: function (name, dataFormat, url) {
            toload[name] = url;
            if (dataFormat == "geojson") {
                d3.json(url, function (error, d) {
                    if (error != undefined) showError(error, url);
                    return loaded(name, d.features);
                });
            } else if (dataFormat == "topojson") {
                d3.json(url, function (error, d) {
                    if (error != undefined) showError(error, url);
                    return loaded(name, topojson.feature(d, d.objects.geo).features);
                });
            } else {
                Messages.setMessage(["DataLoader: Ongeldig formaat [dataFormat = " + dataFormat + "]",
                    "DataLoader: Invalid format [dataFormat = " + dataFormat + "]"], Messages.errorMsg);
                return false;
            }
            return loader;
        },
        attributes: function (name, dataFormat, url, FK) {
            toload[name] = url;
            if (dataFormat == "geojson") {
                d3.json(url, function (error, d) {
                    if (error != undefined) showError(error, url);
                    //create a map using FK as key:
                    var attribData = d3.map();
                    d.features.forEach(function (f) {
                        var FKval = f.properties[FK];
                        var valuesObj = f.properties;
                        if (FKval == undefined || valuesObj == undefined) {
                            Messages.setMessage(["Geen geldige FK. Check metadata!\nFK=" + FK + "; FKval=" + FKval,
                                "No valid FK. Check metadata!\n(FK=" + FK + "; FKval=" + FKval], Messages.errorMsg);
                        }
                        attribData.set(FKval, valuesObj);
                    });
                    return loaded(name, attribData);
                });
            } else if (dataFormat == "topojson") {
                d3.json(url, function (error, d) {
                    if (error != undefined) showError(error, url);
                    //create a map using FK as key:
                    var attribData = d3.map();
                    DEBUG1 = topojson.feature(d, d.objects.geo).features;
                    topojson.feature(d, d.objects.geo).features.forEach(function (f) {
                        var FKval =  f.properties[FK];
                        var valuesObj =  f.properties;
                        if (FKval == undefined || valuesObj == undefined) {
                            Messages.setMessage(["Geen geldige FK. Check metadata!\nFK=" + FK + "; FKval=" + FKval,
                                "No valid FK. Check metadata!\n(FK=" + FK + "; FKval=" + FKval], Messages.errorMsg);
                        }
                        attribData.set(FKval, valuesObj);
                    });
                    return loaded(name, attribData);
                });
            } else if (dataFormat == "csv") {
                d3.csv(url, function (error, d) {
                    if (error != undefined) showError(error, url);
                    //create a map using FK as key:
                    var attribData = d3.map();
                    d.forEach(function (f) {
                        var FKval = f[FK];
                        var valuesObj = f;
                        if (FKval == undefined || valuesObj == undefined) {
                            Messages.setMessage(["Geen geldige FK. Check metadata!\nFK=" + FK + "; FKval=" + FKval,
                                "No valid FK. Check metadata!\n(FK=" + FK + "; FKval=" + FKval], Messages.errorMsg);
                        }
                        attribData.set(FKval, valuesObj);
                    });
                    return loaded(name, attribData);
                });
            } else {
                Messages.setMessage(["DataLoader: Ongeldig formaat [dataFormat = " + dataFormat + "]",
                    "DataLoader: Invalid format [dataFormat = " + dataFormat + "]"], Messages.errorMsg);
                return false;
            }
            return loader;
        },
        onload: function (callback) {
            loadedCallback = callback;
            notifyIfAll();
        }
    };
    return loader;
}
;

function showError(error, url) {
    if (error.status == undefined) { // it's not XMLHTTPrequest error}
        theError = error.name + ": " + error.message;
    } else {
        theError = "HTTP " + error.status + "--" + error.statusText;
    }
    Messages.setMessage(["ACHTERGRONDKAART LADEN MISLUKT!\nURL= " + url + ";\nError: " + theError,
        "ERROR LOADING BACKGROUND MAP!\nURL= " + url + ";\nError: " + theError], Messages.errorMsg);
    return;
}