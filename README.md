##NatAtlas is a proof-of-concept webapplication.

NatAtlas Viewer is a HTML5/SVG webapplication using the D3 Javascript API
to create  National Atlas webmapping in the framework of the Dutch National GeoData Infrastructure.
NatAtlas Viewer is currently only tested fully on recent Chrome and FireFox browsers.
Check out stable test versions on <http://kartoweb.itc.nl/NatAtlas/NatAtlasViewer/>
(not always the latest version, that one is always in this GitHub)...

National Atlas Viewer is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 License.
see http://creativecommons.org/licenses/by-nc-sa/3.0/

Author: Barend Köbben - <a href="mailto:b.j.kobben@utwente.nl">b.j.kobben@utwente.nl</a> --
<a href="http://kartoweb.itc.nl/kobben">kartoweb.itc.nl/kobben</a>

##Changelist:

### version 0.8 [December 2015]:
*   got rid of all use of eval(): e.g. eval("d." + FK) => d[FK]
*   first attempts at breaking up in more js files, with proper classing:
*   Messages.js
*   dataloader.js

### 0.7 [August 2015]:
*   Implementation of mapCompare tools
*   added Jenks algorithm for classification (from GeoStats.js :
   https://github.com/simogeo/geostats/blob/master/lib/geostats.js)
   
### 0.6 [August 2015]:
*   Started using a Changelist ;-)
*   First attempt at new MapChooser
*   repaired circles sizes to use Math.PI
*   use object for dataStats
*   Changed metadata to one file with several languages
*   moved common styles to natatlas.css
*   cleaned up all: clear distinction globals/locals/attributes
*   more error checking in metadata loading
*   added legends (based on d3.legend by Susie Lu: http://d3-legend.susielu.com)
