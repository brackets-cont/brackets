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

/*global define, ga*/
define(function (require, exports, module) {
    "use strict";
    const DEFAULT = "default";

    function _getAttrOrDefault(object, attr, defaultValue) {
        if(object && object[attr]) {
            return object[attr];
        }
        return defaultValue || DEFAULT;
    }

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
        if(value){
            // We have to do this as ga does not allow eventValue without eventLabel
            ga('send', 'event', category, action, label, value);
        } else {
            ga('send', 'event', category, action, label);
        }
    }

    function _sendPlatformMetrics(data) {
        var CATEGORY_PLATFORM = "PLATFORM";
        _sendEvent(CATEGORY_PLATFORM, "os", data["os"]);
        _sendEvent(CATEGORY_PLATFORM, "osLanguage", data["osLanguage"]);
        _sendEvent(CATEGORY_PLATFORM, "bracketsLanguage", data["bracketsLanguage"]);
        _sendEvent(CATEGORY_PLATFORM, "bracketsVersion", data["bracketsVersion"]);
    }

    function _sendProjectMetrics(data) {
        var CATEGORY_PROJECT = "PROJECT",
            NUM_FILES = "numFiles",
            NUM_PROJECTS_OPENED = "numProjectsOpened",
            CACHE_SIZE= "cacheSize",
            numProjects = 0,
            projectDetails = _getAttrOrDefault(data, "ProjectDetails", {});
        for(let projectName in projectDetails) {
            let project = projectDetails[projectName];
            numProjects++;
            let numFiles = _getAttrOrDefault(project, NUM_FILES, 0);
            _sendEvent(CATEGORY_PROJECT, NUM_FILES, null, numFiles);
            let cacheSize = _getAttrOrDefault(project, CACHE_SIZE, 0);
            _sendEvent(CATEGORY_PROJECT, CACHE_SIZE, null, cacheSize);
        }
        _sendEvent(CATEGORY_PROJECT, NUM_PROJECTS_OPENED, null, numProjects);
    }

    function sendHealthDataToGA(healthData) {
        _sendPlatformMetrics(healthData);
        _sendProjectMetrics(healthData);
    }

    exports.sendHealthDataToGA = sendHealthDataToGA;
});
