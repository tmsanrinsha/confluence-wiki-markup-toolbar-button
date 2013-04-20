// ==UserScript==
// @name        Confluence rich text editor toolbar button: Wiki markup
// @description Converts the page to wiki markup, and then displays the wiki markup for editing
// @namespace   http://www.amnet.net.au/~ghannington/confluence/userscripts
// @copyright   Fundi Software 2012
// @license     BSD 2-Clause license; http://opensource.org/licenses/bsd-license.php
// @include     */pages/editpage.action?*
// @include     */pages/createpage.action?*
// @version     1
// ==/UserScript==

var xsl;
var errorText;
var initialized;
var xslURL = "http://www.amnet.net.au/~ghannington/confluence/wikifier/rt/rte-xhtml2wiki.xsl";
var logPrefix = "Wikifier RT"
var toolbarItemID = "wikify-button";
var enabledState = true;
var disabledState = false;

// Get the Atlassian JavaScript abstraction object
var AJS = unsafeWindow.AJS;

// Add a custom toolbar button to the left side of the toolbar
function addButton(state)
{
  var toolbarItemLabel = "Wiki markup";
  var toolbarItemTooltip = "Edit wiki markup";
  var toolbarItemKey = "m";
  
  var toolbarItemStateClass = "";
  
  if (state == disabledState)
  {
    toolbarItemStateClass = " disabled";
    toolbarItemTooltip += " (disabled: see " + logPrefix + " messages in browser console)";
  }
  
  var toolbarItemHTML = '<li id="' + toolbarItemID +
    '" class="toolbar-item' + toolbarItemStateClass +
    '"><a id="' + toolbarItemID +
    '-link" class="toolbar-trigger" title="' + toolbarItemTooltip +
    '" href="#" accesskey="' + toolbarItemKey +
    '"><span class="trigger-text">' + toolbarItemLabel +
    '</span></li>';
  var toolbarGroup = document.createElement("ul");
  toolbarGroup.className = "toolbar-group";
  toolbarGroup.innerHTML = toolbarItemHTML;
  var toolbarLeft = document.getElementsByClassName("toolbar-split-left")[0];
  toolbarLeft.appendChild(toolbarGroup);
  var toolbarItem = document.getElementById(toolbarItemID);
  toolbarItem.addEventListener("click", customAction);
}

// Log failed Ajax load to console
function getFailed(reason, response)
{
  AJS.log(logPrefix + ": Failed to get XSLT stylesheet");
  AJS.log("URL: " + xslURL);
  AJS.log("Reason: " + reason);
  AJS.log("response.status: " + response.status);
  AJS.log("response.statusText: " + response.statusText);
}

// Get XSLT stylesheet from Wikifier RT website
function getXSLT()
{
  var responseStatusOK = 200;
  GM_xmlhttpRequest({
    method: "GET",
    url: xslURL,
    timeout: 2000,
    onload: function(response) {
      switch (response.status)
      {
        case responseStatusOK:
          xsl = new DOMParser()
            .parseFromString(response.responseText, "text/xml");;
          AJS.log(logPrefix + ": loaded XSLT stylesheet");
          addButton(enabledState);
          break;
        default:
          getFailed("Bad response status", response);
          addButton(disabledState);
      }
    },
    onerror: function(response) {
      getFailed("Error", response);
      addButton(disabledState);
    },
    ontimeout: function(response) {
      getFailed("Time out", response);
      addButton(disabledState);
    }
    
  });
}

function init()
{
  if ((document.getElementById(toolbarItemID) == null) && (typeof AJS == "function"))
    getXSLT();
}

function wikify(RTEHTML)
{
  var strWrapperTop = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<body xmlns=\"http://www.w3.org/1999/xhtml\">";
  var strWrapperBottom = "</body>";
  // Wrap HTML snippet in a root element
  var strRTEXHTMLDoc = strWrapperTop + RTEHTML + strWrapperBottom;
  
  // Close <br>, <hr>, and <img> elements
  strRTEXHTMLDoc = strRTEXHTMLDoc.replace(/<(br[^>]*)>/g, "<$1/>");
  strRTEXHTMLDoc = strRTEXHTMLDoc.replace(/<(hr[^>]*)>/g, "<$1/>");
  // More complex regular expression to allow for > in img attribute values
  strRTEXHTMLDoc = strRTEXHTMLDoc.replace(/<(img(?:\s+\S+\s*=\s*"[^"]+")+)>/g, "<$1/>");
  // Also <col> elements (these do not exist in RTE HTML this is just in case someone pastes in content from, say, Excel
  strRTEXHTMLDoc = strRTEXHTMLDoc.replace(/<(col\s+[^>]*)>/g, "<$1/>");
  // Replace entity references
  strRTEXHTMLDoc = strRTEXHTMLDoc.replace(/\&nbsp;/g, "&#160;");
  
  // IE
  if (window.ActiveXObject)
  {
    // Create the new empty DOM tree
    var xml = new ActiveXObject("MSXML2.DOMDocument.6.0");
    // Synchronous load
    xml.async = false;
    xml.preserveWhiteSpace = true;
    xml.resolveExternals = true;
    xml.setProperty("ProhibitDTD", false);
    xml.loadXML(strRTEXHTMLDoc);
    if (xml.parseError.errorCode != 0)
    {
      var errorPossibleFix = "";
      if (xml.parseError.errorCode == -1072896763)
      {
        errorPossibleFix = "Check that your HTML source (except for elements such as <br>, which are expected to be specified just like that, with no end tag) is well-formed (no missing end tags).\n"
      }
      return xml.parseError.reason + errorPossibleFix + "\nError code: " + xml.parseError.errorCode;
    }
    var strWikiMarkup = xml.transformNode(xsl.documentElement);
  }
  // Other browsers
  else if (document.implementation && document.implementation.createDocument)
  {
    var strError = "";
    var parser = new DOMParser();
    var xml = parser.parseFromString(strRTEXHTMLDoc, "application/xml");
    if (xml.documentElement.nodeName=="parsererror")
    {
      var strError=xml.documentElement.childNodes[0].nodeValue;
      return strError;
    } else {
      var errors = xml.getElementsByTagName("parsererror");
      if (errors.length > 0)
      {
        return errors[0].textContent + "\n(No there isn't. Fix the error!)";
      }
    }
    xsltProcessor= new XSLTProcessor();
    xsltProcessor.importStylesheet(xsl);
    strWikiMarkup = xsltProcessor.transformToFragment(xml,document).textContent;
  }
  return strWikiMarkup;
}

// The function that gets called when you click the custom toolbar button
function customAction()
{
  // Get the TinyMCE iframe
  var iframe = document.getElementById("wysiwygTextarea_ifr");
  // Get the RTE HTML
  var RTEHTML = iframe.contentDocument.body.innerHTML;
  // Wikify the RTE HTML
  var wikiMarkup = wikify(RTEHTML);
  // Get the RTE object
  var ed = AJS.Rte.getEditor();
  // Select entire contents
  ed.selection.select(ed.getBody(), true);
  // Display the Wiki Markup dialog
  ed.execCommand("InsertWikiMarkup");
  // Insert the wiki markup into the dialog
  var wikitextarea = AJS.$("textarea[name='wikitext']").last();
  wikitextarea.val(wikiMarkup);
  // Scroll to the top of the text area (does not work without inserting a delay -
  // need to look into using an event handler)
  // wikitextarea.scrollTop(0);
}

init();
