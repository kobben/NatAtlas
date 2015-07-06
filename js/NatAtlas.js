/**
 * National Atlas Viewer
 *
 * Licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 License.
 * see http://creativecommons.org/licenses/by-nc-sa/3.0/
 *
 * @author Barend Köbben <b.j.kobben@utwente.nl>
 *
 * @version 0.5.0 [May 2015]
 */

// metadata as bootstrap, all other data is in there:
var METADATA_URL_NL = "./data/metaData_nl.json";
var METADATA_URL_EN = "./data/metaData_en.json";
var metaDataObj;

// global constants:
const VIEWER_VERSION = "0.5";
const debugOn = true; //activates debugging message window
const NL = 0, EN = 1;
const errorMsg = 0, showMsg = 1, hideMsg = 2, debugMsg = 3;
// For now mapDiv fixed to 550x650 (here and in CSS style)
// TODO: Make rescalable (responsive?)
const mapDivHeight = 650, mapDivWidth = 550;

// global vars:
var currLanguage;
var svgMaps, backgroundMap, mainMap, overlayMap;
var mapMenu;
var map_dims = {map_scale: 0.0, y_offset: 0.0, x_offset: 0.0};
var numMapGroups, numMaps;
var menuDiv, legendDiv, messageDiv;
var geo_path, geoData;
var myData, myDataMin, myDataMax;
var myValueClasses;
//var waterColor = "#ccddf2";
var bgFillColor = "#fffcd5";
//var bgFillColor = "#eeeeee";
var bgStrokeColor = "#ffcccc";
var bgStrokeWidth = "0.2";
var myRatio, labelSize;
var currentMapGroup, currentMap, tooltip, toolTipLabel;

var numClasses = 5;
var maxCircleSize = 20;

/**
 * INITIALISATION FUNCTION
 *
 * @param language :
 * NL or EN, sets UI language used in messages, alerts, etc.
 */
function init(language) {

    currLanguage = language;
    currentMap = -1;
    currentMapGroup = -1;
    metaDataObj = null;
    messageDiv = document.getElementById("messageDiv");
    var metadataURL;
    if (language == NL) {
        metadataURL = METADATA_URL_NL
    } else if (language == EN) {
        metadataURL = METADATA_URL_EN
    } else {
        alert("Invalid startup language in initialisation [" + language + "]")
    }

    // bootstrap metaDataObj json :
    d3.json(metadataURL,
        // inline call-back after data loaded:
        function (error, json) {
            if (error != null) {
                // if bootstrap fails: die gracefully...
                if (error.status == undefined) { // it's not a XMLHTTPrequest error}
                    theError = error.name + ": " + error.message;
                } else {
                    theError = "HTTP " + error.status + ": " + error.statusText;
                }
                setMessage([
                    "BOOTSTRAP MISLUKT: Laden metaDataObj mislukt\nURL= " + metadataURL + "\n" + theError,
                    "BOOTSTRAP FAILED: Error loading metaDataObj\nURL= " + metadataURL + "\n" + theError
                ], errorMsg);
            } else {
                metaDataObj = json; //make global

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

                //create svg element in mapDiv, to hold map layers
                svgMaps = d3.select("#mapDiv").append("svg")
                    .attr("id", "svgMaps")
                    .attr("width", mapDivWidth)
                    .attr("height", mapDivHeight)
                ;
                // CREATE MAP LAYERS (SVG placeholders only for now):
                backgroundMap = svgMaps.append("g")
                    .attr("id", "backgroundMap")
                ;
                mainMap = svgMaps.append("g")
                    .attr("id", "mainMap")
                ;
//        overlayMap = svgMaps.append("g")
//          .attr("id", "overlayMap")
//        ;

                // initiate d3 geo path stream for handling geometric data
                // use AffineTransformation function to override default d3 projection mechanism
                geo_path = d3.geo.path()
                    .projection(new AffineTransformation(map_dims.map_scale, 0, 0, -(map_dims.map_scale),
                        map_dims.x_offset, map_dims.y_offset))
                ;

                // use metadata to create mapgroup & map menu
                var mapMenu = createMenuTree(metaDataObj);

                // load background map from basemap data and render it
                // using the attrib baseMapClassAttr as a class name
                createBackgroundMap(metaDataObj.baseMapDataURL, metaDataObj.baseMapClassAttr);
            }
        });

    //create tooltip divs:
    tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
    tooltip.append("div")
        .attr("class", "tooltip-text");


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
        messageStrs[0] = messageStrs[1] = "No message string supplied to SetMessage!";
    } else if ((messageStrs.length == 1)) {
        //only one language supplied, copy to other language:
        messageStrs[1] = messageStrs[0];
    }
    if (messageType == showMsg) { //log message and display message box
        messageDiv.innerHTML = messageStrs[currLanguage];
        messageDiv.style.display = "inline"
    } else if (messageType == hideMsg) { //log message and hide messagebox
        messageDiv.innerHTML = messageStrs[currLanguage];
        messageDiv.style.display = "none"
    } else if (messageType == errorMsg) { //display Javascript alert
        alert(messageStrs[currLanguage])
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
function createMenuTree(MD) {
    numMapGroups = MD.mapgroups.length;
    numMaps = [];
    for (i = 0; i < numMapGroups; i++) {
        numMaps[i] = MD.mapgroups[i].maps.length;
    }
    for (i = 0; i < numMapGroups; i++) {
        mapMenu = d3.select("#menuDiv")
            .append("h2")
            .html(MD.mapgroups[i].groupname)
            .append("select")
            .attr("class", "menu")
            .attr("id", "mapGroupSelect_" + i)
            .attr("onchange", "chooseMap(" + i +
            ", document.getElementById('mapGroupSelect_' +" + i + ").value)") //trigger mapmaking
        ;
        mapMenu.append("option")
            .html("...")
            .attr("value", "none")
        ;
        for (j = 0; j < numMaps[i]; j++) {
            mapMenu.append("option")
                .attr("value", j)
                .html(MD.mapgroups[i].maps[j].name)
            ;
        }
    }
    return mapMenu;
}

/**
 * Create background layer
 *
 * @param URL : URL to metadata json
 * @param theClass : data attribute to use for CSS class name
 */
function createBackgroundMap(URL, theClassAttr) {
    setMessage(["ACHTERGRONDKAART LADEN...", "LOADING BACKGROUND MAP..."], showMsg);
    setMessage(["", "URL=" + URL], debugMsg);
    d3.json(
        URL,
        // inline call-back function
        function (error, json) {
            if (error != null) {
                theError = error.status + "--" + error.statusText;
                setMessage(["ACHTERGRONDKAART LADEN MISLUKT!\nURL= " + URL + ";\nError: " + theError,
                    "ERROR LOADING BACKGROUND MAP!\nURL= " + URL + ";\nError: " + theError], errorMsg);
            }
            // first make polygons:
            backgroundMap.selectAll("path") // create path nodes
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
 * trigger mapmaking according to mapgroup/map chosen in menu
 *
 * @param mapgroup -
 *          mapgroup chosen
 * @param map -
 *          map chosen
 */
function chooseMap(mapgroup, map) {

    if (mapgroup == "none" || mapgroup == "undefined" || map == "undefined" || map == "none") {
        setMessage(
            ["Geen metadata voor kaart " + map + " van kaartgroep " + mapgroup,
                "No metadata for map " + map + " of mapgroup " + mapgroup], errorMsg);
        return;
    }
    setMessage(["KAART MAKEN [" + mapgroup + "," + map + "]...", "CREATING MAP [" + mapgroup + "," + map + "]..."], showMsg);
    if (mapgroup != currentMapGroup) {
        geoData = null; // empty data layer
        if (currentMapGroup != -1) { //reset previous mapgroup menu
            document.getElementById("mapGroupSelect_" + currentMapGroup).options[0].selected = true;
        }
        toolTipLabel = metaDataObj.mapgroups[mapgroup].defaultLabelAttribute; // labels
        //load new mapgroup data:
        setMessage(["", "Loading new map data; URL=" + metaDataObj.mapgroups[mapgroup].serviceURL], debugMsg);
        d3.json(
            metaDataObj.mapgroups[mapgroup].serviceURL,
            // inline call-back function
            function (error, json) {
                if (error != null) {
                    theError = error.status + "--" + error.statusText;
                    setMessage(["LADEN KAART MISLUKT!\nURL= " + metaDataObj.mapgroups[mapgroup].serviceURL + ";\nError: " + theError,
                        "ERROR LOADING MAP!\nURL= " + metaDataObj.mapgroups[mapgroup].serviceURL + ";\nError: " + theError], errorMsg);
                }
                geoData = json; //load data
                setMessage(["Kaartdata geladen.", "Map data loaded."], hideMsg);
                createMap(geoData, mainMap, mapgroup, map);
                makeDataStats(geoData, mapgroup, map);
                renderMap(geoData, mainMap, mapgroup, map);
                setMessage(["Kaart gemaakt.", "Created map."], hideMsg);
            });
    } else {
        setMessage(["", "Using loaded map data"], debugMsg);
        makeDataStats(geoData, mapgroup, map);
        renderMap(geoData, mainMap, mapgroup, map);
        setMessage(["Kaart gemaakt.", "Created map."], hideMsg);
    }
    makeLegendDiv(mapgroup, map);
    currentMapGroup = parseInt(mapgroup);
    currentMap = parseInt(map);
} // endfunction chooseMap()

/**
 * Creates an empty map with polygon, point and label placeholders
 *
 * @param geoData
 * @param mapLayer
 * @param mapgroup
 * @param map
 */
function createMap(geoData, mapLayer, mapgroup, map) {
    // first delete existing map:
    mapLayer.selectAll("*").remove();

    // make polygons:
    mapLayer.selectAll("path")  // select path nodes
        .data(geoData.features)   // bind and join these to features in json
        .enter().append("path")   // for each create a new path
        .attr("d", geo_path)      // transform supplied json geo to svg "d"
        .attr("fill", bgFillColor)   // for now all same fill color
        .attr("stroke", bgStrokeColor)   // for now all same stroke color
        .attr("stroke-width", bgStrokeWidth)   // for now all same stroke width
        .on("mousemove", function() {toolTipMove(d3.event)})
        .on("mouseleave", function() {toolTipHide()})
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
        .attr("stroke", "rgb(255,255,255)")  // add stroke color
        .attr("stroke-width", "0.3")  // add stroke width
        .attr("fill", "rgb(255,0,0)")  // add fill color
        .attr("fill-opacity", "0.6")  // add fill opacity
        .attr("r", 0)    // add radius , start with r = 0
        .on("mousemove", function() {toolTipMove(d3.event)})
        .on("mouseleave", function() {toolTipHide()})
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
    ;
}


/**
 * Sets point size, polygon fill or label text of map layer based on data layer
 * chosen
 *
 * @param geoData
 * @param mapLayer
 * @param mapgroup
 * @param map
 */
function renderMap(geoData, mapLayer, mapgroup, map) {
    setMessage(["", "Creating map symbolisation..."], debugMsg);

    var mapType = metaDataObj.mapgroups[mapgroup].maps[map].maptype;

    // *** PROPORTIONAL POINT MAPS ****
    if (mapType == "point_size") {
        // remove classified polygon fills
        mapLayer.selectAll("path")       // select path nodes
            .on("mouseenter", function (d) {toolTipShow(d, mapgroup, map)} )
            .transition().duration(1000)
            .attr("fill", bgFillColor)   // all same fill color
            .attr("stroke", bgStrokeColor)   // all same stroke color
            .attr("stroke-width", bgStrokeWidth)   // all same stroke width
        ;
        // remove texts
        mapLayer.selectAll("text")   // select text nodes
            .text("")
        ;
        // change proportional circles sizes:
        mapLayer.selectAll("circle")   // select again all the current circle nodes
            .on("mouseenter", function (d) {toolTipShow(d, mapgroup, map)} )
            .transition().ease("bounce").duration(2000)
            .attr("r", function (d) {
                return radiusFromData(d, mapgroup, map);
            })  // change radius with result from function
        ;

// *** CHOROPLETH MAPS ****
    } else if (mapType == "area_value") { // choropleth map:
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
            .on("mouseenter", function (d) {toolTipShow(d, mapgroup, map)} )
            .transition().duration(1500)
            .attr("fill", function (d) {
                // fill with result from classify function
                return graduatedFillFromData(d, mapgroup, map);
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
            .on("mouseenter", function (d) {toolTipShow(d, mapgroup, map)})
            .transition().duration(1000)
            .attr("fill", bgFillColor)  // back to 1 neutral fill
        ;
        // set text items:
        mapLayer.selectAll("text")   // select text nodes
            .text(function (d) {
                return d3.map(d.properties).get(metaDataObj.mapgroups[mapgroup].maps[map].data_attribute);
            })
        ;

        // *** CHOROCHROMATIC MAPS ****
    } else if (mapType == "area_colour") { // simple label map:
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
            .on("mouseenter", function (d) {toolTipShow(d, mapgroup, map)} )
            .transition().duration(1500)
            .attr("fill", function (d) {
                return nominalFillFromData(d, mapgroup, map);
            })  // fill with result from classify function
        ;

    } else {
        setMessage(
            ["Onbekend Map Type [" + mapType + "]", "Unknown Map Type [" + mapType + "]"], errorMsg);
    }
}


/**
 * update legendDiv according to mapgroup/map chosen in menu
 *
 * @param mapgroup
 * @param map
 */
function makeLegendDiv(mapgroup, map) {
    var legendHTML = "<h3>" + metaDataObj.mapgroups[mapgroup].groupname + "</h3>";
    if (map != null) {
        legendHTML += "<h1>" + metaDataObj.mapgroups[mapgroup].maps[map].name + "</h1>";
    }
    legendHTML += "<p>" + metaDataObj.mapgroups[mapgroup].source + " ("
        + metaDataObj.mapgroups[mapgroup].date + ") </p><hr/>"
        + "<i>" + metaDataObj.mapgroups[mapgroup].groupDescription + "</i>";
    legendDiv = d3.select("#legendDiv")
        .html(legendHTML);
}

function nominalFillFromData(d, mapgroup, map) {
    var myProperties = d3.map(d.properties); // put properties in key-value map
    return myColourClasses(myProperties.get(metaDataObj.mapgroups[mapgroup].maps[map].data_attribute));
}

function graduatedFillFromData(d, mapgroup, map) {
    var myProperties = d3.map(d.properties); // put properties in key-value map
    return myValueClasses(myProperties.get(metaDataObj.mapgroups[mapgroup].maps[map].data_attribute));
}

function radiusFromData(d, mapgroup, map) {
    var myProperties = d3.map(d.properties); // put properties in key-value map
    var theRadius = myRatio * myProperties.get(metaDataObj.mapgroups[mapgroup].maps[map].data_attribute);
    if (theRadius < 0) theRadius = 0;
    return theRadius;
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
function  toolTipShow(d, mapgroup, map) {
    tooltip.transition()
        .duration(250)
        .style("opacity", 1);
    tooltip.select('.tooltip-text')
        .text(infoTextFromData(d, mapgroup, map));
}

function infoTextFromData(d, mapgroup, map) {
    var myProperties = d3.map(d.properties); // put properties in key-value map
    if (map == null) {
        return myProperties.get(toolTipLabel);
    } else {
        return myProperties.get(toolTipLabel) + ": "
            + myProperties.get(metaDataObj.mapgroups[mapgroup].maps[map].data_attribute)
            + metaDataObj.mapgroups[mapgroup].maps[map].unit;
    }
}

// TODO: really need to rewrite this function, seems stupidly elaborate and crappy in places...
function makeDataStats(geoData, mapgroup, map) {
    setMessage(["", "Creating map statistics..."], debugMsg);
    myFeatures = geoData.features;
    numFeatures = myFeatures.length;
    myData = new Array(numFeatures);
    for (i = 0; i < numFeatures; i++) {
        myProperties = d3.map(myFeatures[i].properties); // put properties in KV map
        // based on map chosen in menu, get data out -- +myProperties to force numerical :
        myData[i] = +myProperties.get(metaDataObj.mapgroups[mapgroup].maps[map].data_attribute);
    }
    //console.log(myData);
    myDataMin = d3.min(myData);
    //a crappy solution for NoData vals:
    if (myDataMin <= -99999997) { // is NoData
        myDataMin = 0
    }//
    myDataMax = d3.max(myData);

    //now determine key measures:

    // a ratio between values and circles radius for (proportional) ratio maps:
    myRatio = maxCircleSize / myDataMax;

    // a classed scale for (choropleth) ordered or relative ratio maps:
    myValueClasses = d3.scale.quantize()
        .domain([myDataMin, myDataMax]) // based on original data range
        .range(colorbrewer.Greens[5])   // assign to numClasses classes in Green CB range
    ;
    // an ordinal scale for (chorochromatic) nominal maps
    myColourClasses = d3.scale.ordinal() // make a classes array using d3 ordinal
        .range(colorbrewer.Spectral[11])   // assign to 11 classes Spectral CB range
    ;
    //setMessage(["", "{ Domain: " + myValueClasses.domain() + " -- ValueClasses: " + myValueClasses.range() +
    // " -- CircleRatio: " + maxCircleSize + " / " + myDataMax + " = " + myRatio + " }"], debugMsg);

}