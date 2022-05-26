/*
 * Copyright (c) 2021 - present Brackets.io. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*global define, ga, analytics*/
define(function (require, exports, module) {
    "use strict";
    const CATEGORY_PROJECT = "PROJECT";

    /**
     * send to google analytics
     * @param category string mandatory
     * @param action string mandatory
     * @param label string can be null
     * @param value int can be null
     * @private
     */
    function _sendEvent(category, action, label, value) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        category = category || "eventCategory";
        action = action || "eventAction";
        if(!label){
            label = action;
        }
        if( analytics && analytics.event) {
            analytics.event(category, action, label, value);
        }
        if(value){
            // We have to do this as ga does not allow eventValue without eventLabel
            ga('send', 'event', category, action, label, value);
        } else {
            ga('send', 'event', category, action, label);
        }
    }

    function _sendMapValues(category, action, mapObject) {
        for(let key in mapObject) {
            _sendEvent(category, action, key, mapObject[key]);
        }
    }

    function _sendPlatformMetrics(data) {
        let CATEGORY_PLATFORM = "PLATFORM";
        _sendEvent(CATEGORY_PLATFORM, "os", data["os"]);
        _sendEvent(CATEGORY_PLATFORM, "osLanguage", data["osLanguage"]);
        _sendEvent(CATEGORY_PLATFORM, "bracketsLanguage", data["bracketsLanguage"]);
        _sendEvent(CATEGORY_PLATFORM, "bracketsVersion", data["bracketsVersion"]);
        _sendEvent(CATEGORY_PLATFORM, "AppStartupTime", null, data["AppStartupTime"]);
        _sendEvent(CATEGORY_PLATFORM, "ModuleDepsResolved", null, data["ModuleDepsResolved"]);
    }

    function _sendProjectLoadTimeMetrics(data) {
        let ACTION_PROJECT_LOAD_TIME = "projectLoadTimes";
        let projectLoadTimeStr = data[ACTION_PROJECT_LOAD_TIME] || ""; //  string with : seperated load times":32:21"
        let loadTimes = projectLoadTimeStr.substring(1).split(":");
        for(let i=0; i<loadTimes.length; i++){
            _sendEvent(CATEGORY_PROJECT, "ACTION_PROJECT_LOAD_TIME", null, Number(loadTimes[i]));
        }
    }

    function _sendProjectMetrics(data) {
        let NUM_FILES = "numFiles",
            NUM_PROJECTS_OPENED = "numProjectsOpened",
            CACHE_SIZE= "cacheSize",
            numProjects = 0,
            projectDetails = data["ProjectDetails"] || {};
        for(let projectName in projectDetails) {
            let project = projectDetails[projectName];
            numProjects++;
            let numFiles = project[NUM_FILES] || 0;
            _sendEvent(CATEGORY_PROJECT, NUM_FILES, null, numFiles);
            let cacheSize = project[CACHE_SIZE] || 0;
            _sendEvent(CATEGORY_PROJECT, CACHE_SIZE, null, cacheSize);
        }
        _sendEvent(CATEGORY_PROJECT, NUM_PROJECTS_OPENED, null, numProjects);
        _sendProjectLoadTimeMetrics(data);
    }

    function _sendFileMetrics(data) {
        let CATEGORY_FILE = "FILE_STATS",
            ACTION_OPENED_FILES_EXT = "openedFileExt",
            ACTION_WORKINGSET_FILES_EXT = "workingSetFileExt",
            ACTION_OPENED_FILE_ENCODING = "openedFileEncoding",
            fileStats = data["fileStats"] || {};
        if(fileStats[ACTION_OPENED_FILES_EXT]){
            _sendMapValues(CATEGORY_FILE, ACTION_OPENED_FILES_EXT, fileStats[ACTION_OPENED_FILES_EXT]);
        }
        if(fileStats[ACTION_WORKINGSET_FILES_EXT]){
            _sendMapValues(CATEGORY_FILE, ACTION_WORKINGSET_FILES_EXT, fileStats[ACTION_WORKINGSET_FILES_EXT]);
        }
        if(fileStats[ACTION_OPENED_FILE_ENCODING]){
            _sendMapValues(CATEGORY_FILE, ACTION_OPENED_FILE_ENCODING, fileStats[ACTION_OPENED_FILE_ENCODING]);
        }
    }

    function _sendSearchMetrics(data) {
        let CATEGORY_SEARCH = "searchDetails",
            ACTION_SEARCH_NEW = "searchNew",
            ACTION_SEARCH_INSTANT = "searchInstant",
            searchDetails = data[CATEGORY_SEARCH] || {},
            searchNew = searchDetails[ACTION_SEARCH_NEW] || 0,
            searchInstant = searchDetails[ACTION_SEARCH_INSTANT] || 0;
        _sendEvent(CATEGORY_SEARCH, ACTION_SEARCH_NEW, null, searchNew);
        _sendEvent(CATEGORY_SEARCH, ACTION_SEARCH_INSTANT, null, searchInstant);
    }

    function _sendThemesMetrics(data) {
        let CATEGORY_THEMES = "THEMES",
            ACTION_CURRENT_THEME = "bracketsTheme";
        _sendEvent(CATEGORY_THEMES, ACTION_CURRENT_THEME, data[ACTION_CURRENT_THEME]);
    }

    function _sendExtensionMetrics(data) {
        let CATEGORY_EXTENSIONS = "EXTENSIONS",
            CATEGORY_INSTALLED_EXTENSIONS = "installedExtensions",
            NUM_EXTENSIONS_INSTALLED = "numExtensions",
            ATTR_NAME = "name",
            ATTR_VERSION = "version",
            extensionStats = data["installedExtensions"] || [];
        for(let i=0; i<extensionStats.length; i++) {
            let extension = extensionStats[i],
                name = extension[ATTR_NAME] || "-",
                version = extension[ATTR_VERSION] || "-";
            _sendEvent(CATEGORY_INSTALLED_EXTENSIONS, name, version);
        }
        _sendEvent(CATEGORY_EXTENSIONS, NUM_EXTENSIONS_INSTALLED, null, extensionStats.length);
    }

    function sendHealthDataToGA(healthData) {
        _sendPlatformMetrics(healthData);
        _sendProjectMetrics(healthData);
        _sendFileMetrics(healthData);
        _sendSearchMetrics(healthData);
        _sendThemesMetrics(healthData);
        _sendExtensionMetrics(healthData);
    }

    exports.sendHealthDataToGA = sendHealthDataToGA;
});
