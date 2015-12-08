/**
 * National Atlas Viewer
 *
 * Licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 License.
 * see http://creativecommons.org/licenses/by-nc-sa/3.0/
 *
 * @author Barend Köbben - b.j.kobben@utwente.nl
 *
 * @version 0.8 [December 2015]
 * -- see ChangeList in README.md
 */


var DEBUG,DEBUG1;


// metadata as bootstrap, all other necessary data is in there:
var METADATA_URL;
METADATA_URL = "./data/metaData.json";
var MD; //global MetaDataObject

// global vars:
var VIEWER_VERSION = "0.8";
var debugOn = true; //activates debugging message window
var NL = 0, EN = 1;
// For now mapDiv fixed to 550x650 (here and in CSS style)
// TODO: Make rescalable (responsive?)
var mapDivHeight = 590, mapDivWidth = 500;
var mapVis = 0, graphVis = 1;
var numClasses = 5;
var minCircleSize = 0;
var maxCircleSize = 20;
var curLang;
var mainMap, mainMapBG, compareMap, compareMapBG;
var map_dims = {map_scale: 0.0, y_offset: 0.0, x_offset: 0.0};
var mainLegendDiv, compareLegendDiv, compareDiv, compareToolsDiv,
    compareMapDiv, compareToolsDiv, messageDiv;
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
    Messages.init(messageDiv,curLang);


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
                Messages.setMessage([
                    "BOOTSTRAP MISLUKT: Laden MetaData mislukt\nURL= " + metadataURL + "\n" + theError,
                    "BOOTSTRAP FAILED: Error loading MetaData\nURL= " + metadataURL + "\n" + theError
                ], Messages.errorMsg);
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
                createBackgroundMap(mainMapBG, MD.baseMapDataFormat, MD.baseMapDataURL, MD.baseMapClassAttr);
                createBackgroundMap(compareMapBG, MD.baseMapDataFormat, MD.baseMapDataURL, MD.baseMapClassAttr);

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
 * @varructor
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
 * Create map menus
 * from MD = the global metadata object for maps
 */
function showMapGroups() {

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
            .attr("onclick", "createMap(" + mapGroup + "," + mapSubject + "," + mapUnit + "," + i + ");")
        ;
    }
}



/**
 * Create comparemap menus
 * from MD = the global metadata object for maps to compare
 * [TODO: for now the same as the main MD]
 */
function showCompareGroups() {

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
    d3.select("#cDate").selectAll("input").remove();
    var mapDatesList = d3.select("#cDate");
    for (i = 0; i < MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[mapUnit].mapdates.length; i++) {
        mapDatesList.append("input")
            .attr("type", "button")
            .attr("value", MD.mapgroups[mapGroup].mapsubjects[mapSubject].mapunits[mapUnit].mapdates[i].date)
            .attr("onclick", "createCompareMap(" + mapGroup + "," + mapSubject + "," + mapUnit + "," + i + ");")
        ;
    }
}



/**
 * Create background map layers
 *
 * @param URL : URL to metadata json
 * @param theClass : data attribute to use for CSS class name
 */
function createBackgroundMap(mapLayer, theFormat, URL, theClassAttr) {
    Messages.setMessage(["ACHTERGRONDKAART LADEN...", "LOADING BACKGROUND MAP..."], Messages.showMsg);
    Messages.setMessage(["", mapLayer[0][0].id + ": " + URL], Messages.debugMsg);
    DataLoader()
        .geometries('BGMap', theFormat, URL)
        .onload(function (dataLoaded) {
            // first make polygons:
            mapLayer.selectAll("path") // create path nodes
                .data(dataLoaded.BGMap) // bind & join to features array
                .enter().append("path") // for each create a new path
                .attr("d", geo_path) // use special transformation stream initialised in init() for path data
                .attr("class", function (d) {
                    return d3.map(d.properties).get(theClassAttr); //get class from data using the Attr
                })
            ;
            Messages.setMessage(["Achtergrondkaart geladen.", "Background Map loaded."], Messages.hideMsg);
            }
        );
}


/**
 * trigger mapmaking according to mapgroup/etc chosen in menu
 *
// * */

function createMap(mapgroup, mapsubject, mapunit, mapdate) {

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
        Messages.setMessage(
            ["Geen metadata voor kaart [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]",
                "No metadata for map [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]"
            ], Messages.errorMsg);

        return;
    } else {

        Messages.setMessage(["KAART MAKEN [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]...",
                "CREATING MAP [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]..."],
            Messages.showMsg);

        try {
            var geoMD = MD.geo_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].geo_data];
            var geoURL = geoMD.serviceURL;
            var attribMD = MD.attrib_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].attrib_data];
            var attribURL = attribMD.serviceURL;
            var FK = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].FK;
        } catch (e) {
            console.log(e);
        }

        Messages.setMessage(["", "Loading geodata; URL=" + geoURL], Messages.debugMsg);
        Messages.setMessage(["", "Loading attribute data; URL=" + attribURL], Messages.debugMsg);

        DataLoader()
            .geometries('geoData', geoMD.serviceOutputFormat, geoURL)
            .attributes('attribData', attribMD.serviceOutputFormat, attribURL, FK)
            .onload(function (dataLoaded) {

                Messages.setMessage(["Data geladen.", "Data loaded."], Messages.hideMsg);
                createMapPlaceholders(dataLoaded.geoData, mainMap);
                symboliseMap(dataLoaded.attribData, FK, mainMap, mapgroup, mapsubject, mapunit, mapdate);
                Messages.setMessage(["Kaart gemaakt.", "Created map."], Messages.hideMsg);
                showCompareBtn();

                }
            );

    } //if-else

} // endfunction createMap()

/**
 * trigger mapmaking according to mapgroup/etc chosen in menu
 *
 * */
function createCompareMap(mapgroup, mapsubject, mapunit, mapdate) {

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
        Messages.setMessage(
            ["Geen metadata voor kaart [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]",
                "No metadata for map [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]"
            ], Messages.errorMsg);

        return;
    } else {

        Messages.setMessage(["KAART MAKEN [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]...",
                "CREATING MAP [" + mapgroup + "," + mapsubject + "," + mapunit + "," + mapdate + "]..."],
            Messages.showMsg);

        try {
            var geoMD = MD.geo_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].geo_data];
            var geoURL = geoMD.serviceURL;
            var attribMD = MD.attrib_sources[MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].attrib_data];
            var attribURL = attribMD.serviceURL;
            var FK = MD.mapgroups[mapgroup].mapsubjects[mapsubject].mapunits[mapunit].mapdates[mapdate].FK;
        } catch (e) {
            console.log(e);
        }

        Messages.setMessage(["", "Loading geodata; URL=" + geoURL], Messages.debugMsg);
        Messages.setMessage(["", "Loading attribute data; URL=" + attribURL], Messages.debugMsg);

        DataLoader()
            .geometries('geoData', geoMD.serviceOutputFormat, geoURL)
            .attributes('attribData', attribMD.serviceOutputFormat, attribURL, FK)
            .onload(function (dataLoaded) {

                    Messages.setMessage(["Data geladen.", "Data loaded."], Messages.hideMsg);
                    createMapPlaceholders(dataLoaded.geoData, compareMap);
                    symboliseMap(dataLoaded.attribData, FK, compareMap, mapgroup, mapsubject, mapunit, mapdate);
                    Messages.setMessage(["Kaart gemaakt.", "Created map."], Messages.hideMsg);
                    showCompareBtn();

                }
            );

    } //if-else

} // endfunction createCompareMap()


function showCompareBtn() {
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
function createMapPlaceholders(geoData, mapLayer) {

    // first delete existing map, if any:
    mapLayer.selectAll("*").remove();

    // make polygons:
    mapLayer.selectAll("path")  // select path nodes
        .data(geoData)   // bind and join these to features in json
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
        .data(geoData)    // bind and join these to the features array in json
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
        .data(geoData)  // bind and join these to the features array in json
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
function symboliseMap(attribData, FK, mapLayer, mapgroup, mapsubject, mapunit, mapdate) {

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
            .attr("class", "defaultPolygons")  // add default style from css
        ;
        // remove texts
        mapLayer.selectAll("text")   // select text nodes
            .text("")
        ;
        //determine colour to use:
        var myCol;
        if (mapLayer == mainMap) {
            myCol = mapClassification.colours[0];
        } else {
            myCol = mapClassification.colours[1];
        }
        // change proportional circles sizes (and maybe colour):
        mapLayer.selectAll("circle")   // select again all the current circle nodes
            .style("fill", myCol)
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
            .attr("class", "classedPolygons") //to avoid being treated as background!
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
            .attr("class", "classedPolygons") //to avoid being treated as background!
            .style("fill", function (d) {
                return dataStats.dClass2Colour(getAttribValue(d, attribData, mapAttrib, mapFK));
            })  // fill with result from classify function
        ;


    } else {
        Messages.setMessage(
            ["Onbekend Map Type [" + mapType + "]", "Unknown Map Type [" + mapType + "]"], Messages.errorMsg);
    }

    Messages.setMessage(["", "Created map symbolisation."], Messages.debugMsg);
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
        FKval = d.properties[mapFK];
        attribValue = attribData.get(FKval)[mapAttrib];
    } catch (e) {
        Messages.setMessage(["Fout in data!\nFK=" + FKval + "; attribuut=" + mapAttrib + "; waarde=" + attribValue,
        "Error retrieving data!\n(FK=" + FKval + "; attribute=" + mapAttrib + "; value=" + attribValue], Messages.errorMsg);
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
        //determine colour to use:
        var myCol;
        if (whichLegend == mainLegendDiv) {
            myCol = mapClassification.colours[0];
        } else {
            myCol = mapClassification.colours[1];
        }
        legendSVG.selectAll("circle").style("fill", myCol);

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
        Messages.setMessage(
            ["Onbekend Map Type [" + mapType + "]", "Unknown Map Type [" + mapType + "]"], Messages.errorMsg);
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
            myStats.dValues[i] = + v[attrib]; //+ to force numerical
            if (myStats.dValues[i] == undefined || isNaN(myStats.dValues[i])) {
                errorStr = "Maptype=" + mapType + "; data=" + myStats.dValues[i];
            }
        } else { //area_label or area_colour
            myStats.dValues[i] = v[attrib];
            if (myStats.dValues[i] == undefined) {
                errorStr = "Maptype=" + mapType + "; data=" + myStats.dValues[i];
            }
        }
        i++;
    });
    if (errorStr != "") {
        Messages.setMessage(["ONGELDIGE DATA VOOR DIT MAPTYPE!\n" + errorStr,
            "INVALID DATA FOR THIS MAPTYPE!\n" + errorStr], Messages.errorMsg);
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
            var CBrange = colorbrewer[mapClassification.colours][mapClassification.numclasses];
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
            var CBrange = colorbrewer[mapClassification.colours][mapClassification.numclasses];
        } catch (e) {
            InvalidClassMessage(clStr + "\n'" + mapClassification.colours + "' not valid ColorBrewer name, or no. of classes not available.");
        }
        myStats.dClass2Colour = d3.scale.ordinal() // make a classes array using d3 ordinal
            .range(CBrange)

    } else {
        Messages.setMessage(
            ["Onbekend Map Type [" + mapType + "]", "Unknown Map Type [" + mapType + "]"], Messages.errorMsg);
    }

    Messages.setMessage(["", "Calculated map statistics."], Messages.debugMsg);
    //if (debugOn) console.log(myStats);
    return myStats;
}

function InvalidClassMessage(Str) {
    Messages.setMessage(["ONGELDIGE CLASSIFICATIE!\n" + Str,
        "INVALID CLASSIFICATION!\n" + Str], Messages.errorMsg);
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