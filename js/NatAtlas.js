/**
 * National Atlas Viewer
 *
 * Licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 License.
 * see http://creativecommons.org/licenses/by-nc-sa/3.0/
 *
 * @author Barend Köbben - b.j.kobben@utwente.nl
 *
 * @version 0.7.0 [August 2015]
 * - Implementation of mapCompare tools
 *
 * earlier: 0.6.0 [August 2015]
 * - First attempt at new MapChooser
 * - repaired circles sizes to use Math.PI
 * - use object for dataStats
 * - Changed metadata to one file with several languages
 * - moved common styles to natatlas.css
 * - cleaned up all: clear distinction globals/locals/attributes
 * - more error checking in metadata loading
 * - added legends (based on d3.legend by Susie Lu: d3-legend.susielu.com)
 *
 */

// metadata as bootstrap, all other necessary data is in there:
var METADATA_URL;
METADATA_URL = "./data/metaData.json";
var MD; //global MetaDataObject

// global constants:
const VIEWER_VERSION = "0.6";
const debugOn = true; //activates debugging message window
const NL = 0, EN = 1;
const errorMsg = 0, showMsg = 1, hideMsg = 2, debugMsg = 3;
// For now mapDiv fixed to 550x650 (here and in CSS style)
// TODO: Make rescalable (responsive?)
const mapDivHeight = 590, mapDivWidth = 500;

// global vars:
var numClasses = 5;
var minCircleSize = 0;
var maxCircleSize = 20;
var mapgroup = -1, mapsubject = -1,
    mapunit = -1, mapdate = -1;
var curLang;
var mainMap, mainMapBG, compareMap, compareMapBG;
var map_dims = {map_scale: 0.0, y_offset: 0.0, x_offset: 0.0};
var mainLegendDiv, compareLegendDiv, compareDiv, compareToolsDiv,messageDiv;
var geo_path;
var tooltip;
var xSliderElem;
var oSliderElem;
var wSliderElem;
var bCheckElem;
var xScale = d3.scale.linear()
    .range([135, 770])
    .domain([0, 1]);
var oScale = d3.scale.linear()
    .range([0, 1])
    .domain([0, 100]);
var wScale = d3.scale.linear()
    .range([0, 500])
    .domain([0, 100]);


var DEBUG;

/**
 * INITIALISATION FUNCTION
 *
 * @param language :
 * NL or EN, sets UI language used in messages, alerts, etc.
 */
function init(language) {
    var metadataURL;
    if (language == NL) {
        curLang = NL;
        metadataURL = METADATA_URL;
    } else if (language == EN) {
        curLang = EN;
        metadataURL = METADATA_URL;
    } else {
        curLang = language;
        metadataURL = undefined;
        alert("Invalid startup language in initialisation [" + language + "]")
    }
    MD = undefined;
    messageDiv = document.getElementById("messageDiv");
    mainLegendDiv = d3.select("#mainLegendDiv");
    compareLegendDiv = d3.select("#compareLegendDiv");
    compareDiv = d3.select("#compareDiv");
    compareMapDiv = d3.select("#compareMapDiv");
    compareToolsDiv= d3.select("#compareToolsDiv");

    xSliderElem = document.getElementById("xSlider");
    oSliderElem = document.getElementById("oSlider");
    wSliderElem = document.getElementById("wSlider");
    bCheckElem = document.getElementById("bCheck");

    // bootstrap MD json :
    d3.json(metadataURL,
        // inline call-back after data loaded:
        function (error, json) {
            if (error != undefined) {
                // if bootstrap fails: die gracefully...
                if (error.status == undefined) { // it's not XMLHTTPrequest error}
                    theError = error.name + ": " + error.message;
                } else {
                    theError = "HTTP " + error.status + "--" + error.statusText;
                }
                setMessage([
                    "BOOTSTRAP MISLUKT: Laden MetaData mislukt\nURL= " + metadataURL + "\n" + theError,
                    "BOOTSTRAP FAILED: Error loading MetaData\nURL= " + metadataURL + "\n" + theError
                ], errorMsg);
            } else {
                MD = json; //make global
                // use RD projection limits to calculate scale and bounds needed for
                // affine transformation of RD coordinates to screen coordinates
                var map_minx = 13600;
                var map_miny = 306900;
                var map_maxx = 278000;
                var map_maxy = 619300;
                var map_height = map_maxy - map_miny;
                var map_width = map_maxx - map_minx;
                map_dims.map_scale = mapDivHeight / map_height;
                map_dims.y_offset = (map_maxy * map_dims.map_scale);
                map_dims.x_offset = -(map_minx * map_dims.map_scale);


                // CREATE MAP LAYERS (empty SVG <g>s for now):
                var mainMapSVG = d3.select("#mainMapDiv").append("svg")
                        .attr("id", "mainMapSVG")
                        .attr("width", mapDivWidth)
                        .attr("height", mapDivHeight)
                    ;
                mainMapBG = mainMapSVG.append("g")
                    .attr("id", "mainMapBG")
                ;
                mainMap = mainMapSVG.append("g")
                    .attr("id", "mainMap")
                ;
                //note compareMap is created, hidden at start (-> CSS)
                var compareMapSVG = d3.select("#compareMapDiv").append("svg")
                        .attr("id", "compareMapSVG")
                        .attr("width", mapDivWidth)
                        .attr("height", mapDivHeight)
                    ;
                compareMapBG = compareMapSVG.append("g")
                    .attr("id", "compareMapBG")
                ;
                compareMap = compareMapSVG.append("g")
                    .attr("id", "compareMap")
                ;

                // initiate d3 geo path stream for handling geometric data
                // use AffineTransformation function to override default d3 projection mechanism
                geo_path = d3.geo.path()
                    .projection(new AffineTransformation(map_dims.map_scale, 0, 0, -(map_dims.map_scale),
                        map_dims.x_offset, map_dims.y_offset))
                ;

                // load background maps from basemap data and render it
                // using the attrib baseMapClassAttr as a class name
                createBackgroundMap(mainMapBG, MD.baseMapDataURL, MD.baseMapClassAttr);
                createBackgroundMap(compareMapBG, MD.baseMapDataURL, MD.baseMapClassAttr);
            }
        });

    //create tooltip divs:
    tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
    ;
    tooltip.append("div")
        .attr("class", "tooltip-text")
    ;


}//init()


/**
 * Implements Affine transformation as a pseudo d3 projection,
 * overriding standard d3.geo.projection.stream, because we do
 * NOT want projection from latlon to cartesian and resampling,
 * but instead translate & scale RD coordinates into screen coordinates
 *
 * @param a : X scale
 * @param b : X rotation
 * @param c : Y rotation
 * @param d : Y scale
 * @param tx : X offset
 * @param ty : Y offset
 * @returns {{stream: Function}}
 * @constructor
 */
function AffineTransformation(a, b, c, d, tx, ty) {
    return {
        stream: function (output) {
            return {
                point: function (x, y) {
                    // extra: round coords to integers:
                    output.point(Math.round(a * x + b * y + tx), Math.round(c * x + d * y + ty));
                },
                sphere: function () {
                    output.sphere();
                },
                lineStart: function () {
                    output.lineStart();
                },
                lineEnd: function () {
                    output.lineEnd();
                },
                polygonStart: function () {
                    output.polygonStart();
                },
                polygonEnd: function () {
                    output.polygonEnd();
                }
            };
        }
    };
}


/**
 * Bi-lingual messaging system used for messages as well as errors and debug info
 *
 * @param messageStrs : array of messages [0=NL,1=EN]
 * @param messageType : const defining messageType (errorMsg,showMsg,hideMsg,debugMsg)
 */
function setMessage(messageStrs, messageType) {
    //first some checking and if necessary repairing:
    if (messageStrs.length == 0) {
        //no message:
        messageStrs[0] = messageStrs[1] = "No message supplied to SetMessage!";
    } else if ((messageStrs.length == 1)) {
        //only one language supplied, copy to other language:
        messageStrs[1] = messageStrs[0];
    }
    if (messageType == showMsg) { //log message and display message box
        messageDiv.innerHTML = messageStrs[curLang];
        messageDiv.style.display = "inline"
    } else if (messageType == hideMsg) { //log message and hide messagebox
        messageDiv.innerHTML = messageStrs[curLang];
        messageDiv.style.display = "none"
    } else if (messageType == errorMsg) { //display Javascript alert
        alert(messageStrs[curLang]);
    }
    if (debugOn) { // all messageTypes are logged in console:
        // debug messages only in english
        console.log(messageStrs[EN]);
    }
}


/**
 * Create map menus from metadata json object
 *
 * @param MD : the metadata JSON object
 */
function showMapGroups(MD) {

    hideCompareMap() ;
    //fold open div:
    d3.select("#chooserDiv")
        .transition().duration(1000)
        .style("width", "400px")
        .style("height", "300px")
    ;
    //clean up open menus:
    d3.select("#mGroup").selectAll("input").remove();
    d3.select("#mSubject").selectAll("input").remove();
    d3.select("#mUnit").selectAll("input").remove();
    d3.select("#mDate").selectAll("input").remove();
    var mapGroupsList = d3.select("#mGroup");
    for (i = 0; i < MD.mapgroups.length; i++) {
        mapGroupsList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[i].groupname[curLang])
            .attr("onclick", "showMapSubjects(" + i + ");")
        ;
    }
}

function showMapSubjects(mapGroup) {

    //clean up open menus:
    d3.select("#mSubject").selectAll("input").remove();
    d3.select("#mUnit").selectAll("input").remove();
    d3.select("#mDate").selectAll("input").remove();
    var mapSubjectsList = d3.select("#mSubject");
    for (i = 0; i < MD.mapgroups[mapGroup].mapsubjects.length; i++) {
        mapSubjectsList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[mapGroup].mapsubjects[i].name[curLang])
            .attr("onclick", "showMapUnits(" + mapGroup + "," + i + ");")
        ;
    }
}

function showMapUnits(mapGroup, mapSubject) {

    //clean up open menus:
    d3.select("#mUnit").selectAll("input").remove();
    d3.select("#mDate").selectAll("input").remove();
    var mapUnitsList = d3.select("#mUnit");
    for (i = 0; i < MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits.length; i++) {
        mapUnitsList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[i].name[curLang])
            .attr("onclick", "showMapDates(" + mapGroup + "," + mapSubject + "," + i + ");")
        ;
    }
}

function showMapDates(mapGroup, mapSubject, mapUnit) {

    //clean up open menus:
    d3.select("#mDate").selectAll("input").remove();
    var mapDatesList = d3.select("#mDate");
    for (i = 0; i < MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[mapUnit].mapdates.length; i++) {
        mapDatesList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[mapUnit].mapdates[i].date)
            .attr("onclick", "chooseMap(" + mapGroup + "," + mapSubject + "," + mapUnit + "," + i + ");")
        ;
    }
}/**
 * Create comparemap menus from metadata json object
 *
 * @param MD : the metadata JSON object
 */
function showCompareGroups(MD) {

    showCompareMap() ;
    //fold open div:
    d3.select("#compareDiv")
        .transition().duration(1000)
        .style("width", "400px")
        .style("height", "300px")
    ;
    //clean up open menus:
    d3.select("#cGroup").selectAll("input").remove();
    d3.select("#cSubject").selectAll("input").remove();
    d3.select("#cUnit").selectAll("input").remove();
    d3.select("#cDate").selectAll("input").remove();
    var mapGroupsList = d3.select("#cGroup");
    for (i = 0; i < MD.mapgroups.length; i++) {
        mapGroupsList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[i].groupname[curLang])
            .attr("onclick", "showCompareSubjects(" + i + ");")
        ;
    }
}

function showCompareSubjects(mapGroup) {

    //clean up open menus:
    d3.select("#cSubject").selectAll("input").remove();
    d3.select("#cUnit").selectAll("input").remove();
    d3.select("#cDate").selectAll("input").remove();
    var mapSubjectsList = d3.select("#cSubject");
    for (i = 0; i < MD.mapgroups[mapGroup].mapsubjects.length; i++) {
        mapSubjectsList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[mapGroup].mapsubjects[i].name[curLang])
            .attr("onclick", "showCompareUnits(" + mapGroup + "," + i + ");")
        ;
    }
}

function showCompareUnits(mapGroup, mapSubject) {

    //clean up open menus:
    d3.select("#cUnit").selectAll("input").remove();
    d3.select("#cDate").selectAll("input").remove();
    var mapUnitsList = d3.select("#cUnit");
    for (i = 0; i < MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits.length; i++) {
        mapUnitsList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[i].name[curLang])
            .attr("onclick", "showCompareDates(" + mapGroup + "," + mapSubject + "," + i + ");")
        ;
    }
}

function showCompareDates(mapGroup, mapSubject, mapUnit) {

    //clean up open menus:
    d3.select("#mDate").selectAll("input").remove();
    var mapDatesList = d3.select("#cDate");
    for (i = 0; i < MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[mapUnit].mapdates.length; i++) {
        mapDatesList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[mapUnit].mapdates[i].date)
            .attr("onclick", "chooseCompareMap(" + mapGroup + "," + mapSubject + "," + mapUnit + "," + i + ");")
        ;
    }
}

/**
 * Create background layer
 *
 * @param URL : URL to metadata json
 * @param theClass : data attribute to use for CSS class name
 */
function createBackgroundMap(mapLayer, URL, theClassAttr) {
    setMessage(["ACHTERGRONDKAART LADEN...", "LOADING BACKGROUND MAP..."], showMsg);
    setMessage(["", mapLayer[0][0].id + ": " + URL], debugMsg);
    d3.json(
        URL,
        // inline call-back function
        function (error, json) {
            if (error != undefined) {
                if (error.status == undefined) { // it's not XMLHTTPrequest error}
                    theError = error.name + ": " + error.message;
                } else {
                    theError = "HTTP " + error.status + "--" + error.statusText;
                }
                setMessage(["ACHTERGRONDKAART LADEN MISLUKT!\nURL= " + URL + ";\nError: " + theError,
                    "ERROR LOADING BACKGROUND MAP!\nURL= " + URL + ";\nError: " + theError], errorMsg);
                return;
            }

            // first make polygons:
            mapLayer.selectAll("path") // create path nodes
                .data(json.features) // bind & join to features array
                .enter().append("path") // for each create a new path
                .attr("d", geo_path) // use special transformation stream initialised in init() for path data
                .attr("class", function (d) {
                    return d3.map(d.properties).get(theClassAttr); //get class from data using the Attr
                })
            ;
            setMessage(["Achtergrondkaart geladen.", "Background Map loaded."], hideMsg);
        });
}


/**
 * trigger mapmaking according to mapgroup/etc chosen in menu
 *
 * */
function chooseMap(mapgroup, mapsubject, mapunit, mapdate) {

    //fold down chooserDiv:
    d3.select("#chooserDiv")
        .transition().duration(250)
        .style("width", "120px")
        .style("height", "20px")
    ;

    var geoData = undefined; // empty data layer
    var attribData = undefined; // empty attrib layer

    if (mapgroup == -1 || mapsubject == -1 || mapunit == -1 || mapdate == -1
        || MD.mapgroups[mapgroup] == undefined
        || MD.mapgroups[mapgroup].mapsubjects[mapsubject] == undefined
        || MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit] == undefined
        || MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate] == undefined) {
        setMessage(
            ["Geen metadata voor kaart [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]",
                "No metadata for map [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]"
            ], errorMsg);

        return;
    } else {

        setMessage(["KAART MAKEN [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]...",
                "CREATING MAP [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]..."],
            showMsg);

        // foreign key to link geo with attrib data
        var FK = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].FK;

        // geo_data loader:
        try {
            var geoMD = MD.geo_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].geo_data];
            var geoURL = geoMD.serviceURL;
        } catch (e) {
            console.log(e);
        }
        setMessage(["", "Loading geodata; URL=" + geoURL], debugMsg);
        d3.json(geoURL, function (error, json) {
            if (error != undefined) {
                if (error.status == undefined) { // it's not XMLHTTPrequest error}
                    theError = error.name + ": " + error.message;
                } else {
                    theError = "HTTP " + error.status + "--" + error.statusText;
                }
                setMessage(["KAART LADEN MISLUKT!\nURL= " + geoURL + ";\nError: " + theError,
                    "ERROR LOADING MAP!\nURL= " + geoURL + ";\nError: " + theError], errorMsg);
                return;
            }

            if (geoMD.serviceOutputFormat == "geojson") {
                geoData = json; //load data
            } else if (geoMD.serviceOutputFormat == "topojson") {
                geoData = topojson.feature(json, json.objects.geo);
            } else {
                setMessage(["Ongeldig formaat [serviceOutputFormat = " + geoMD.serviceOutputFormat + "]",
                    "Invalid format [serviceOutputFormat = " + geoMD.serviceOutputFormat + "]"], errorMsg);
            }

            // attrib_data loader:
            try {
                var attribMD = MD.attrib_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].attrib_data];
                var attribURL = attribMD.serviceURL;
            } catch (e) {
                console.log(e);
            }
            setMessage(["", "Loading attribute data; URL=" + attribURL], debugMsg);
            if (attribMD.serviceOutputFormat == "geojson") {

                d3.json(attribURL, function (error, json) {
                    if (error != undefined) {
                        if (error.status == undefined) { // it's not XMLHTTPrequest error}
                            theError = error.name + ": " + error.message;
                        } else {
                            theError = "HTTP " + error.status + "--" + error.statusText;
                        }
                        setMessage(["LADEN ATTRIBUUTDATA MISLUKT!\nURL= " + attribURL + ";\nError: " + theError,
                            "ERROR LOADING ATTRIBUTE DATA!\nURL= " + attribURL + ";\nError: " + theError], errorMsg);
                        return;
                    }

                    //create a map using FK as key:
                    attribData = d3.map();
                    json.features.forEach(function (d,i) {
                        var FKval = eval("d.properties." + FK);
                        var valuesObj = d.properties;
                        if (FKval == undefined || valuesObj == undefined) {
                            setMessage(["Geen geldige FK. Check metadata!\nFK=" + FK + "; FKval=" + FKval,
                                "No valid FK. Check metadata!\n(FK=" + FK + "; FKval=" + FKval], errorMsg);
                        }
                        attribData.set(FKval,valuesObj);
                    });

                    setMessage(["Kaartdata geladen.", "Map data loaded."], hideMsg);
                    createMap(geoData, mainMap);
                    symboliseMap(geoData, attribData, FK, mainMap, mapgroup, mapsubject, mapunit, mapdate);
                    setMessage(["Kaart gemaakt.", "Created map."], hideMsg);
                    showCompareMapBtn();
                }); // geojson attrib_data loader

            } else if (attribMD.serviceOutputFormat == "csv") {

                d3.csv(attribURL, function (error, csv) {
                    if (error != undefined) {
                        if (error.status == undefined) { // it's not XMLHTTPrequest error}
                            theError = error.name + ": " + error.message;
                        } else {
                            theError = "HTTP " + error.status + "--" + error.statusText;
                        }
                        setMessage(["LADEN ATTRIBUUTDATA MISLUKT!\nURL= " + attribURL + ";\nError: " + theError,
                            "ERROR LOADING ATTRIBUTE DATA!\nURL= " + attribURL + ";\nError: " + theError], errorMsg);
                        return;
                    }

                    //create a map using FK as key:
                    attribData = d3.map(csv, function (d) {
                        var FKval = eval("d." + FK);
                        if (FKval == undefined) {
                            setMessage(["Geen geldige FK. Check metadata!\nFK=" + FK + "; FKval=" + FKval,
                                "No valid FK. Check metadata!\n(FK=" + FK + "; FKval=" + FKval], errorMsg);
                        }
                        return FKval;
                    });

                    setMessage(["Kaartdata geladen.", "Map data loaded."], hideMsg);
                    createMap(geoData, mainMap);
                    symboliseMap(geoData, attribData, FK, mainMap, mapgroup, mapsubject, mapunit, mapdate);
                    setMessage(["Kaart gemaakt.", "Created map."], hideMsg);
                    showCompareMapBtn();
                }); // CSV attrib_data loader

            } else {
                setMessage(["Ongeldig formaat [serviceOutputFormat = " + attribMD.serviceOutputFormat + "]",
                    "Invalid format [serviceOutputFormat = " + attribMD.serviceOutputFormat + "]"], errorMsg);
            }
        }); //geo_data loader
    } //if-else
} // endfunction chooseMap()

/**
 * trigger mapmaking according to mapgroup/etc chosen in menu
 *
 * */
function chooseCompareMap(mapgroup, mapsubject, mapunit, mapdate) {

    //fold down compareDiv:
    d3.select("#compareDiv")
        .transition().duration(250)
        .style("width", "120px")
        .style("height", "20px")
    ;
    showCompareMap();

    var geoData = undefined; // empty data layer
    var attribData = undefined; // empty attrib layer

    if (mapgroup == -1 || mapsubject == -1 || mapunit == -1 || mapdate == -1
        || MD.mapgroups[mapgroup] == undefined
        || MD.mapgroups[mapgroup].mapsubjects[mapsubject] == undefined
        || MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit] == undefined
        || MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate] == undefined) {
        setMessage(
            ["Geen metadata voor kaart [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]",
                "No metadata for map [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]"
            ], errorMsg);

        return;
    } else {

        setMessage(["KAART MAKEN [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]...",
                "CREATING MAP [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]..."],
            showMsg);

        // foreign key to link geo with attrib data
        var FK = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].FK;

        // geo_data loader:
        try {
            var geoMD = MD.geo_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].geo_data];
            var geoURL = geoMD.serviceURL;
        } catch (e) {
            console.log(e);
        }
        setMessage(["", "Loading geodata; URL=" + geoURL], debugMsg);
        d3.json(geoURL, function (error, json) {
            if (error != undefined) {
                if (error.status == undefined) { // it's not XMLHTTPrequest error}
                    theError = error.name + ": " + error.message;
                } else {
                    theError = "HTTP " + error.status + "--" + error.statusText;
                }
                setMessage(["KAART LADEN MISLUKT!\nURL= " + geoURL + ";\nError: " + theError,
                    "ERROR LOADING MAP!\nURL= " + geoURL + ";\nError: " + theError], errorMsg);
                return;
            }

            if (geoMD.serviceOutputFormat == "geojson") {
                geoData = json; //load data
            } else if (geoMD.serviceOutputFormat == "topojson") {
                geoData = topojson.feature(json, json.objects.geo);
            } else {
                setMessage(["Ongeldig formaat [serviceOutputFormat = " + geoMD.serviceOutputFormat + "]",
                    "Invalid format [serviceOutputFormat = " + geoMD.serviceOutputFormat + "]"], errorMsg);
            }

            // attrib_data loader:
            try {
                var attribMD = MD.attrib_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].attrib_data];
                var attribURL = attribMD.serviceURL;
            } catch (e) {
                console.log(e);
            }
            setMessage(["", "Loading attribute data; URL=" + attribURL], debugMsg);
            if (attribMD.serviceOutputFormat == "geojson") {

                d3.json(attribURL, function (error, json) {
                    if (error != undefined) {
                        if (error.status == undefined) { // it's not XMLHTTPrequest error}
                            theError = error.name + ": " + error.message;
                        } else {
                            theError = "HTTP " + error.status + "--" + error.statusText;
                        }
                        setMessage(["LADEN ATTRIBUUTDATA MISLUKT!\nURL= " + attribURL + ";\nError: " + theError,
                            "ERROR LOADING ATTRIBUTE DATA!\nURL= " + attribURL + ";\nError: " + theError], errorMsg);
                        return;
                    }

                    //create a map using FK as key:
                    attribData = d3.map();
                    json.features.forEach(function (d,i) {
                        var FKval = eval("d.properties." + FK);
                        var valuesObj = d.properties;
                        if (FKval == undefined || valuesObj == undefined) {
                            setMessage(["Geen geldige FK. Check metadata!\nFK=" + FK + "; FKval=" + FKval,
                                "No valid FK. Check metadata!\n(FK=" + FK + "; FKval=" + FKval], errorMsg);
                        }
                        attribData.set(FKval,valuesObj);
                    });

                    setMessage(["Kaartdata geladen.", "Map data loaded."], hideMsg);
                    createMap(geoData, compareMap);
                    symboliseMap(geoData, attribData, FK, compareMap, mapgroup, mapsubject, mapunit, mapdate);
                    setMessage(["Kaart gemaakt.", "Created map."], hideMsg);
                }); // geojson attrib_data loader

            } else if (attribMD.serviceOutputFormat == "csv") {

                d3.csv(attribURL, function (error, csv) {
                    if (error != undefined) {
                        if (error.status == undefined) { // it's not XMLHTTPrequest error}
                            theError = error.name + ": " + error.message;
                        } else {
                            theError = "HTTP " + error.status + "--" + error.statusText;
                        }
                        setMessage(["LADEN ATTRIBUUTDATA MISLUKT!\nURL= " + attribURL + ";\nError: " + theError,
                            "ERROR LOADING ATTRIBUTE DATA!\nURL= " + attribURL + ";\nError: " + theError], errorMsg);
                        return;
                    }

                    //create a map using FK as key:
                    attribData = d3.map(csv, function (d) {
                        var FKval = eval("d." + FK);
                        if (FKval == undefined) {
                            setMessage(["Geen geldige FK. Check metadata!\nFK=" + FK + "; FKval=" + FKval,
                                "No valid FK. Check metadata!\n(FK=" + FK + "; FKval=" + FKval], errorMsg);
                        }
                        return FKval;
                    });

                    setMessage(["Kaartdata geladen.", "Map data loaded."], hideMsg);
                    createMap(geoData, compareMap);
                    symboliseMap(geoData, attribData, FK, compareMap, mapgroup, mapsubject, mapunit, mapdate);
                    setMessage(["Kaart gemaakt.", "Created map."], hideMsg);
                }); // CSV attrib_data loader

            } else {
                setMessage(["Ongeldig formaat [serviceOutputFormat = " + attribMD.serviceOutputFormat + "]",
                    "Invalid format [serviceOutputFormat = " + attribMD.serviceOutputFormat + "]"], errorMsg);
            }
        }); //geo_data loader
    } //if-else
} // endfunction chooseCompareMap()


function showCompareMapBtn() {
    compareDiv.style("display", "inline");
}

function showCompareMap() {
    compareDiv.style("display", "inline");
    compareLegendDiv.style("display", "inline");
    compareMapDiv.style("display", "inline");
    compareToolsDiv.style("display", "inline");
}

function hideCompareMap() {
    compareDiv.style("display", "none");
    compareMap.selectAll("*").remove();
    compareLegendDiv.style("display", "none");
    compareLegendDiv.selectAll("*").remove();
    compareMapDiv.style("display", "none");
    compareToolsDiv.style("display", "none");
}

/**
 * Creates an empty map with polygon, point and label placeholders
 */
function createMap(geoData, mapLayer) {

    // first delete existing map, if any:
    DEBUG = mapLayer;
    mapLayer.selectAll("*").remove();

    // make polygons:
    mapLayer.selectAll("path")  // select path nodes
        .data(geoData.features)   // bind and join these to features in json
        .enter().append("path")   // for each create a new path
        .attr("d", geo_path)      // transform supplied json geo to svg "d"
        .attr("class", "defaultPolygons")   // for now all same fill-stroke (from css)
        .on("mousemove", function () {
            toolTipMove(d3.event)
        })
        .on("mouseleave", function () {
            toolTipHide()
        })
    ;
    // create proportional circles on top:
    mapLayer.selectAll("circle")  // select circle nodes
        .data(geoData.features)    // bind and join these to the features array in json
        .enter().append("circle")  // for each create a new circle
        .attr("cx", function (d) {
            return x = Math.round(geo_path.centroid(d)[0]);
        }) // transform the supplied json geo path centroid X to svg "cx"
        .attr("cy", function (d) {
            return y = Math.round(geo_path.centroid(d)[1]);
        }) // transform the supplied json geo path centroid Y to svg "cy"
        .attr("class", "defaultCircles")  // add default style (from css)
        .attr("r", 0)    // add radius , start with r = 0
        .on("mousemove", function () {
            toolTipMove(d3.event)
        })
        .on("mouseleave", function () {
            toolTipHide()
        })
    ;
    // create empty text items:
    mapLayer.selectAll("text") // select text nodes
        .data(geoData.features)  // bind and join these to the features array in json
        .enter().append("text")  // for each create a new text object
        .text("")
        .attr("class", "label")
        .attr("text-anchor", "middle")  // center text
        .attr("x", function (d) {
            // transform the supplied json geo path centroid X to svg "x"
            return Math.round(geo_path.centroid(d)[0]) - (this.getComputedTextLength() / 2);
        })
        .attr("y", function (d) {
            // transform the supplied json geo path centroid Y to svg "y"
            return Math.round(geo_path.centroid(d)[1]);
        })
        .on("mousemove", function () {
            toolTipMove(d3.event)
        })
        .on("mouseleave", function () {
            toolTipHide()
        })
    ;
}


/**
 * Sets point size, polygon fill and/or label text of map based on data chosen
 */
function symboliseMap(geoData, attribData, FK, mapLayer, mapgroup, mapsubject, mapunit, mapdate) {

    var mapType = MD.mapgroups[mapgroup].mapsubjects[mapsubject].maptype;
    var mapAttrib = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].attrib;
    var mapFK = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].FK;
    var tooltipLabel = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].label;
    var mapUnit = MD.mapgroups[mapgroup].mapsubjects[mapsubject].data_unit[curLang];
    var mapClassification = MD.mapgroups[mapgroup].mapsubjects[mapsubject].classification;
    var dataStats;

    // *** PROPORTIONAL POINT MAPS ****
    if (mapType == "point_size") {
        dataStats = makeStats(attribData, mapAttrib, mapType, mapClassification);
        // remove classified polygon fills
        mapLayer.selectAll("path")       // select path nodes
            .on("mouseenter", function (d) {
                toolTipShow(infoTextFromData(d, attribData, tooltipLabel, mapAttrib, mapFK, mapUnit));
            })
            .transition().duration(1000)
            .attr("class", "defaultPolygons")  // add defaul// lt style (from css)
        ;
        // remove texts
        mapLayer.selectAll("text")   // select text nodes
            .text("")
        ;
        // change proportional circles sizes:
        mapLayer.selectAll("circle")   // select again all the current circle nodes
            .style("fill", mapClassification.colours)
            .on("mouseenter", function (d) {
                toolTipShow(infoTextFromData(d, attribData, tooltipLabel, mapAttrib, mapFK, mapUnit));
            })
            .transition().ease("bounce").duration(2000)
            .attr("r", function (d) {
                var theVal = getAttribValue(d, attribData, mapAttrib, mapFK);
                var theRadius = (Math.sqrt(theVal) / Math.PI) * dataStats.dCircleRatio;
                if (theRadius < 0) theRadius = 0;
                return theRadius;
            })  // change radius with result from function
        ;

// *** CHOROPLETH MAPS ****
    } else if (mapType == "area_value") { // choropleth map:
        dataStats = makeStats(attribData, mapAttrib, mapType, mapClassification);
        // shrink circles :
        mapLayer.selectAll("circle")   // select again all the current circle nodes
            .transition().duration(1000)
            .attr("r", 0)  // change radius to 0
        ;
        // remove texts
        mapLayer.selectAll("text")   // select text nodes
            .text("")
        ;
        // make classified polygons:
        mapLayer.selectAll("path")       // select path nodes
            .on("mouseenter", function (d) {
                toolTipShow(infoTextFromData(d, attribData, tooltipLabel, mapAttrib, mapFK, mapUnit));
            })
            .transition().duration(1500)
            .style("fill", function (d) {
                // fill with result from classify function
                return dataStats.dClass2Value(+getAttribValue(d, attribData, mapAttrib, mapFK));
            })
        ;

        // *** LABEL MAPS ****
    } else if (mapType == "area_label") { // simple label map:
        // shrink circles :
        mapLayer.selectAll("circle")   // select again all the current circle
            // nodes
            .transition().duration(1000)
            .attr("r", 0)  // change radius to 0
        ;
        // remove classified polygon fills
        mapLayer.selectAll("path")       // select path nodes
            .on("mouseenter", function (d) {
                toolTipShow(infoTextFromData(d, attribData, tooltipLabel, mapAttrib, mapFK, mapUnit));
            })
            .transition().duration(1000)
            .attr("class", "defaultPolygons")  // add default style (from css)
        ;
        // set text items:
        mapLayer.selectAll("text")   // select text nodes
            .on("mouseenter", function (d) {
                toolTipShow(infoTextFromData(d, attribData, tooltipLabel, mapAttrib, mapFK, mapUnit));
            })
            .text(function (d) {
                return getAttribValue(d, attribData, mapAttrib, mapFK);
            })
        ;

        // *** CHOROCHROMATIC MAPS ****
    } else if (mapType == "area_colour") { // simple label map:
        dataStats = makeStats(attribData, mapAttrib, mapType, mapClassification);
        // shrink circles :
        mapLayer.selectAll("circle")   // select again all the current circle nodes
            .transition().duration(1000)
            .attr("r", 0)  // change radius to 0
        ;
        // remove texts
        mapLayer.selectAll("text")   // select text nodes
            .text("")
        ;
        // make classified polygons:
        mapLayer.selectAll("path")       // select path nodes
            .on("mouseenter", function (d) {
                toolTipShow(infoTextFromData(d, attribData, tooltipLabel, mapAttrib, mapFK, mapUnit));
            })
            .transition().duration(1500)
            .style("fill", function (d) {
                return dataStats.dClass2Colour(getAttribValue(d, attribData, mapAttrib, mapFK));
            })  // fill with result from classify function
        ;

    } else {
        setMessage(
            ["Onbekend Map Type [" + mapType + "]", "Unknown Map Type [" + mapType + "]"], errorMsg);
    }

    setMessage(["", "Created map symbolisation."], debugMsg);
    if (mapLayer == mainMap) {
        makeLegend(mainLegendDiv, mapgroup, mapsubject, mapunit, mapdate, mapType, mapClassification, dataStats);
    } else {
        makeLegend(compareLegendDiv, mapgroup, mapsubject, mapunit, mapdate, mapType, mapClassification, dataStats);
    }
}

function getAttribValue(d, attribData, mapAttrib, mapFK) {
    var FKval = undefined;
    var attribValue = undefined;
    try {
        FKval = eval("d.properties." + mapFK);
        attribValue = eval("attribData.get(FKval)." + mapAttrib);
    } catch (e) {
        setMessage(["Fout in data!\nFK=" + FKval + "; attribuut=" + mapAttrib + "; waarde=" + attribValue,
        "Error retrieving data!\n(FK=" + FKval + "; attribute=" + mapAttrib + "; value=" + attribValue], errorMsg);
    }
    return attribValue;
}

/**
 * update legendDiv according to mapgroup/map chosen in menu
 *
 */
function makeLegend(whichLegend, mapgroup, mapsubject, mapunit, mapdate, mapType, mapClassification, dataStats) {

    var geoSourceStr = ["Geodata", "Geodata"];
    var dataSourceStr = ["Attribuut data", "Attribute data"];
    var mapObj = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate];

    var legendHeader = "<h3>" + MD.mapgroups[mapgroup].groupname[curLang] + "</h3>";
    legendHeader += "<h1>" + MD.mapgroups[mapgroup].mapsubjects[mapsubject].name[curLang] + "</h1><h4>";
    if (MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].name[curLang] != "") {
        legendHeader += "per " + MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].name[curLang] + " ";
    }
    legendHeader += "(" + mapObj.date + ")</h4>";
    if (MD.mapgroups[mapgroup].mapsubjects[mapsubject].data_unit[curLang] != "") {
        legendHeader += "<span>" + MD.mapgroups[mapgroup].mapsubjects[mapsubject].data_unit[curLang] + ":</span>";
    }

    whichLegend.html(legendHeader);

    var legendSVG = whichLegend.append("svg")
            .attr("id", "legendSVG")
            .attr("width", "100%")
            .attr("height", "100%")
        ;


    // *** PROPORTIONAL POINT MAPS ****
    if (mapType == "point_size") {

        legendSVG.append("g")
            .attr("class", "mySizeLegend")
            .attr("transform", "translate(20,20)")
        ;
        var linearSize = d3.scale.linear().domain([0, dataStats.dMax]).range([0, maxCircleSize]);
        //var linearSize = d3.scale.linear().domain([0,100]).range([10, 20]);

        var mySizeLegend = d3.legend.size()
                .scale(linearSize)
                .labelFormat(d3.format(mapClassification.format))
                .shape('circle')
                .shapePadding(2)
                .labelOffset(1)
                .cells(4)
                .orient('vertical')
            ;
        legendSVG.select(".mySizeLegend")
            .call(mySizeLegend)
        ;
        legendSVG.selectAll("circle").style("fill", mapClassification.colours);

        legendSVG.style("height", mySizeLegend.legendHeight());

        // *** CHOROPLETH MAPS ****
    } else if (mapType == "area_value") { // choropleth map:


        legendSVG.append("g")
            .attr("class", "myColorLegend")
            .attr("transform", "translate(0,0)")
        ;
        var myColorLegend = d3.legend.color()
                .labelFormat(d3.format(mapClassification.format))
                .labelDelimiter("–")
                .shapeWidth(20)
                .useClass(false)
                .orient('vertical')
                .scale(dataStats.dClass2Value)
            ;
        legendSVG.select(".myColorLegend")
            .call(myColorLegend)
        ;
        legendSVG.style("height", myColorLegend.legendHeight());

        // *** LABEL MAPS ****
    } else if (mapType == "area_label") { // simple label map:
        // No legend for label map
        legendSVG.style("height", "0");

        // *** CHOROCHROMATIC MAPS ****
    } else if (mapType == "area_colour") { // simple label map:

        legendSVG.append("g")
            .attr("class", "myLegend")
            .attr("transform", "translate(0,0)")
        ;
        var legend = d3.legend.color()
                .labelFormat(d3.format(".0f"))
                .shapeWidth(20)
                .useClass(false)
                .scale(dataStats.dClass2Colour)
            ;
        legendSVG.select(".myLegend")
            .call(legend)
        ;
        legendSVG.style("height", legend.legendHeight());

    } else {
        setMessage(
            ["Onbekend Map Type [" + mapType + "]", "Unknown Map Type [" + mapType + "]"], errorMsg);
    }

    var legendFooter = "<hr><p class='small'>" + geoSourceStr[curLang] + ": "
        + MD.geo_sources[mapObj.geo_data].source[curLang] + "<br>";
    legendFooter += dataSourceStr[curLang] + ": " + MD.attrib_sources[mapObj.attrib_data].source[curLang];
    legendFooter += "<br><i>";
    //legendFooter += MD.atlasName[curLang] + " (" + MD.atlasVersion + ") -- ";
    legendFooter += MD.atlasCopyright[curLang] + "</i></p>";

    whichLegend.append("div").html(legendFooter);

}

function toolTipMove(d) {
    tooltip.style("left", (d.pageX + 7) + "px")
        .style("top", (d.pageY + 12) + "px");
}
function toolTipHide() {
    tooltip.transition()
        .duration(250)
        .style("opacity", 0);
}
function toolTipShow(theText) {
    tooltip.transition()
        .duration(250)
        .style("opacity", 1);
    tooltip.select('.tooltip-text')
        .text(theText);
}

function infoTextFromData(d, attribData, labelAttrib, mapAttrib, mapFK, mapUnit) {
    var theText = "";
    if (labelAttrib != mapAttrib) {
        theText += getAttribValue(d, attribData, labelAttrib, mapFK) + ": "
    }
    theText += getAttribValue(d, attribData, mapAttrib, mapFK) + " " + mapUnit;
    return theText;
}


function makeStats(attribData, attrib, mapType, mapClassification) {

    var myStats = {
        dValues: undefined, dMin: undefined, dMax: undefined, dCircleRatio: undefined,
        dClasses: undefined, dClass2Value: undefined, dClass2Colour: undefined
    };

    var numFeatures = attribData.size();
    myStats.dValues = new Array(numFeatures);
    var i = 0;
    var errorStr = "";
    attribData.forEach(function (k, v) {
        if (mapType == "point_size" || mapType == "area_value") {
            myStats.dValues[i] = +eval("v." + attrib); //+ to force numerical
            if (myStats.dValues[i] == undefined || isNaN(myStats.dValues[i])) {
                errorStr = "Maptype=" + mapType + "; data=" + myStats.dValues[i];
            }
        } else { //area_label or area_colour
            myStats.dValues[i] = eval("v." + attrib);
            if (myStats.dValues[i] == undefined) {
                errorStr = "Maptype=" + mapType + "; data=" + myStats.dValues[i];
            }
        }
        i++;
    });
    if (errorStr != "") {
        setMessage(["ONGELDIGE DATA VOOR DIT MAPTYPE!\n" + errorStr,
            "INVALID DATA FOR THIS MAPTYPE!\n" + errorStr], errorMsg);
        console.log(myStats.dValues);
    }

    var clStr = "type=" + mapClassification.type + "; numclasses=" + mapClassification.numclasses + "; classes="
        + mapClassification.classes + "; colours=" + mapClassification.colours + "; format=" + mapClassification.format;
    console.log(clStr);

    // *** PROPORTIONAL POINT MAPS ****
    if (mapType == "point_size") {
        myStats.dMin = d3.min(myStats.dValues);
        //TODO: less crappy solution for NoData vals:
        if (myStats.dMin <= -99999997) { // is NoData
            myStats.dMin = 0
        }
        myStats.dMax = d3.max(myStats.dValues);
        // a ratio between values and circles radius for (proportional) ratio maps:
        myStats.dCircleRatio = maxCircleSize / (Math.sqrt(myStats.dMax) / Math.PI );

        // *** CHOROPLETH MAPS ****
    } else if (mapType == "area_value") { // choropleth map:
        myStats.dMin = d3.min(myStats.dValues);
        //TODO: less crappy solution for NoData vals:
        if (myStats.dMin <= -99999997) { // is NoData
            myStats.dMin = 0
        }
        myStats.dMax = d3.max(myStats.dValues);
        if (mapClassification.numclasses == undefined) {
            mapClassification.numclasses = 5;
        }
        if (mapClassification.numclasses < 3 || mapClassification.numclasses > 11) {
            InvalidClassMessage(clStr + "\nInvalid numclasses (<3 or >11).");
        }
        if (mapClassification.type == "jenks") { //use jenks.js to calculate Jenks Natural breaks
            myStats.dClasses = jenks(myStats.dValues, mapClassification.numclasses);
        } else if (mapClassification.type == "manual") { // use manual
            if (mapClassification.classes == undefined) {
                InvalidClassMessage(clStr + "\nClasses array needed for manual classification.");
            }
            if (mapClassification.classes[0] == "dMin") {
                mapClassification.classes[0] = myStats.dMin;
            }
            if (mapClassification.classes[mapClassification.classes.length - 1] == "dMax") {
                mapClassification.classes[mapClassification.classes.length - 1] = myStats.dMax;
            }
            //check manual classes
            if (mapClassification.classes[0] > myStats.dMin) {
                InvalidClassMessage(clStr + "\nData min < lowest class.");
            } else if (mapClassification.classes[mapClassification.classes.length - 1] < myStats.dMax) {
                InvalidClassMessage(clStr + "\nData max > highest class.");
            } else if (mapClassification.classes.length - 1 != mapClassification.numclasses) {
                InvalidClassMessage(clStr + "\nClasses array length does not match number of classes.");
            } else { // all correct
                myStats.dClasses = mapClassification.classes;
            }

        } else {
            InvalidClassMessage(clStr + "\nInvalid type.");
        }
        // a classed scale for (choropleth) ordered or relative ratio maps:
        try {
            var CBrange = eval("colorbrewer." + mapClassification.colours + "[" + mapClassification.numclasses + "]");
        } catch (e) {
            InvalidClassMessage(clStr + "\n'" + mapClassification.colours + "' is not a valid ColorBrewer name.");
        }
        myStats.dClass2Value = d3.scale.quantile()
            .domain(myStats.dClasses) // use jenks or manual classes (see above)
            .range(CBrange)
        ;

        // *** LABEL MAPS ****
    } else if (mapType == "area_label") { // simple label map:

        // *** CHOROCHROMATIC MAPS ****
    } else if (mapType == "area_colour") { // simple label map:

        // an ordinal scale for (chorochromatic) nominal maps
        if (mapClassification.numclasses == undefined) {
            mapClassification.numclasses = 25; //25 is max for scale MaxColours
        }
        if (mapClassification.numclasses < 3 || mapClassification.numclasses > 25) {
            InvalidClassMessage(clStr + "\nInvalid numclasses (<3 or >24).");
        }
        try {
            var CBrange = eval("colorbrewer." + mapClassification.colours + "[" + mapClassification.numclasses + "]");
        } catch (e) {
            InvalidClassMessage(clStr + "\n'" + mapClassification.colours + "' not valid ColorBrewer name, or no. of classes not available.");
        }
        myStats.dClass2Colour = d3.scale.ordinal() // make a classes array using d3 ordinal
            .range(CBrange)

    } else {
        setMessage(
            ["Onbekend Map Type [" + mapType + "]", "Unknown Map Type [" + mapType + "]"], errorMsg);
    }

    setMessage(["", "Calculated map statistics."], debugMsg);
    //if (debugOn) console.log(myStats);
    return myStats;
}

function InvalidClassMessage(Str) {
    setMessage(["ONGELDIGE CLASSIFICATIE!\n" + Str,
        "INVALID CLASSIFICATION!\n" + Str], errorMsg);
}


function xSlider() {
    compareMapDiv.transition().duration(1000)
        .style("left", xScale(xSliderElem.value)+"px" );
    if (xScale(xSliderElem.value) == 135) {
        oSliderElem.disabled = false;
        wSliderElem.disabled = false;
    } else {
        oSliderElem.value = 100;
        compareMapDiv.style("opacity", 1 );
        oSliderElem.disabled = true;
        wSliderElem.value = 100;
        compareMapDiv.style("width", "500px" );
        wSliderElem.disabled = true;
        bCheckElem.checked = true;
        compareMapBG.style("display", "inline");
        compareMapDiv.style("background", "#ccddf2");
        compareMap.selectAll(".defaultPolygons").style("fill","#fffcd5");
    }
}
function wSlider() {
    compareMapDiv.style("width", wScale(wSliderElem.value)+"px" );
}
function oSlider() {
    compareMapDiv.style("opacity", oScale(oSliderElem.value) );
}
function bCheck() {
    if (bCheckElem.checked) {
        compareMapBG.style("display", "inline");
        compareMapDiv.style("background", "#ccddf2");
        compareMap.selectAll(".defaultPolygons").style("fill","#fffcd5");
    } else {
        compareMapBG.style("display", "none");
        compareMapDiv.style("background", "none");
        compareMap.selectAll(".defaultPolygons").style("fill","none");
    }
}