/**
 * Messages.js:
 * * Bi-lingual messaging system used for messages as well as errors and debug info
 *
 * part of the National Atlas Viewer system
 *
 * Licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 License.
 * see http://creativecommons.org/licenses/by-nc-sa/3.0/
 *
 * @author Barend Köbben - b.j.kobben@utwente.nl
 *
 * @version 1.0 [October 2015]
 * part of attempts at creating parts of NatAtlasViewer as seperate classes
 * re-implementation of existing Message function
 *
 */

Messages =  {

    MsgDiv:  null,

    init: function(div, language) {
        Messages.MsgDiv = div;
        Messages.curLang = language;
        Messages.NL = 0, Messages.EN = 1;
        Messages.errorMsg = 0, Messages.showMsg = 1, Messages.hideMsg = 2, Messages.debugMsg = 3;
        //alert("inited !");
    }

    ,

    setMessage: function (messageStrs, messageType) {
        //first some checking and if necessary repairing:
        if (messageStrs.length == 0) {
            //no message:
            messageStrs[0] = messageStrs[1] = "No message supplied to SetMessage!";
        } else if ((messageStrs.length == 1)) {
            //message in only one language, copy to other language:
            messageStrs[1] = messageStrs[0];
        }
        if (messageType == Messages.showMsg) { //log message and display message box
            Messages.MsgDiv.innerHTML = messageStrs[Messages.curLang];
            Messages.MsgDiv.style.display = "inline"
        } else if (messageType == Messages.hideMsg) { //log message and hide messagebox
            Messages.MsgDiv.innerHTML = messageStrs[Messages.curLang];
            Messages.MsgDiv.style.display = "none"
        } else if (messageType == Messages.errorMsg) { //display Javascript alert
            alert(messageStrs[Messages.curLang]);
        }
        if (debugOn) { // all messageTypes are logged in console:
            // debug messages only in english
            console.log(messageStrs[Messages.EN]);
        }
    }

}
