/*
 * Copyright (c) 2015 - present Adobe Systems Incorporated. All rights reserved.
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

/*global define, $, brackets, console, appshell , ga, window, document, localStorage, Map, setTimeout*/
define(function (require, exports, module) {
    "use strict";
    var AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        HealthLogger        = brackets.getModule("utils/HealthLogger"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        UrlParams           = brackets.getModule("utils/UrlParams").UrlParams,
        Strings             = brackets.getModule("strings"),
        HealthDataUtils     = require("HealthDataUtils"),
        uuid                = require("thirdparty/uuid"),
        SendToAnalytics     = require("SendToAnalytics"),
        prefs               = PreferencesManager.getExtensionPrefs("healthData"),
        params              = new UrlParams(),
        ONE_SECOND          = 1000,
        ONE_MINUTE          = 60 * 1000,
        ONE_DAY             = 24 * 60 * ONE_MINUTE,
        FIRST_LAUNCH_SEND_DELAY = 30 * ONE_MINUTE,
        timeoutVar,
        gaInitComplete = false,
        sentAnalyticsDataMap = new Map();

    prefs.definePreference("healthDataTracking", "boolean", true, {
        description: Strings.DESCRIPTION_HEALTH_DATA_TRACKING
    });

    function _initGoogleAnalytics() {
        if(gaInitComplete){
            return;
        }
        function init(i, s, o, g, r, a, m) {
            i.GoogleAnalyticsObject = r;
            i[r] = i[r] || function() {
                (i[r].q = i[r].q || []).push(arguments);
            }, i[r].l = 1 * new Date();
            a = s.createElement(o),
                m = s.getElementsByTagName(o)[0];
            a.async = 1;
            a.src = g;
            m.parentNode.insertBefore(a, m);
        }
        init(window, document, 'script', 'https://www.google-analytics.com/analytics.js', 'ga');

        ga('create', brackets.config.googleAnalyticsID, {
            'storage': 'none',
            'clientId': localStorage.getItem('ga:clientId')
        });
        ga(function(tracker) {
            localStorage.setItem('ga:clientId', tracker.get('clientId'));
        });
        ga('set', 'checkProtocolTask', null);

        ga('set', 'page', 'brackets');
        ga('send', 'pageview');
        gaInitComplete = true;

    }

    function _initCoreAnalytics() {
        // Load core analytics scripts
        if(!window.analytics){ window.analytics = {
            _initData: [], loadStartTime: new Date().getTime(),
            event: function (){window.analytics._initData.push(arguments);}
        };}
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.onload = function(){
            // replace `your_analytics_account_ID` and `appName` below with your values
            window.initAnalyticsSession( brackets.config.coreAnalyticsID,
                brackets.config.coreAnalyticsAppName);
            window.analytics.event("core-analytics", "client-lib", "loadTime", 1,
                (new Date().getTime())- window.analytics.loadStartTime);
        };
        script.src = 'https://unpkg.com/@aicore/core-analytics-client-lib/dist/analytics.min.js';
        document.getElementsByTagName('head')[0].appendChild(script);
    }

    /**
     * We are transitioning to our own analytics instead of google as we breached the free user threshold of google
     * and paid plans for GA starts at 100,000 USD.
     * @private
     */
    function _initAnalytics(){
        _initGoogleAnalytics();
        _initCoreAnalytics();
    }

    // Dont load google analytics at startup to unblock require sync load.
    window.setTimeout(_initAnalytics, ONE_SECOND);

    params.parse();

    /**
     * Get the Health Data which will be sent to the server. Initially it is only one time data.
     */
    function getHealthData() {
        var result = new $.Deferred(),
            oneTimeHealthData = {};

        oneTimeHealthData.snapshotTime = Date.now();
        oneTimeHealthData.os = brackets.platform;
        oneTimeHealthData.userAgent = window.navigator.userAgent;
        oneTimeHealthData.osLanguage = brackets.app.language;
        oneTimeHealthData.bracketsLanguage = brackets.getLocale();
        oneTimeHealthData.bracketsVersion = brackets.metadata.version;
        $.extend(oneTimeHealthData, HealthLogger.getAggregatedHealthData());
        HealthDataUtils.getUserInstalledExtensions()
            .done(function (userInstalledExtensions) {
                oneTimeHealthData.installedExtensions = userInstalledExtensions;
            })
            .always(function () {
                HealthDataUtils.getUserInstalledTheme()
                    .done(function (bracketsTheme) {
                        oneTimeHealthData.bracketsTheme = bracketsTheme;
                    })
                    .always(function () {
                        var userUuid  = PreferencesManager.getViewState("UUID");
                        var olderUuid = PreferencesManager.getViewState("OlderUUID");

                        if (userUuid && olderUuid) {
                            oneTimeHealthData.uuid      = userUuid;
                            oneTimeHealthData.olderuuid = olderUuid;
                            return result.resolve(oneTimeHealthData);
                        } else {

                            // So we are going to get the Machine hash in either of the cases.
                            if (appshell.app.getMachineHash) {
                                appshell.app.getMachineHash(function (err, macHash) {

                                    var generatedUuid;
                                    if (err) {
                                        generatedUuid = uuid.v4();
                                    } else {
                                        generatedUuid = macHash;
                                    }

                                    if (!userUuid) {
                                        // Could be a new user. In this case
                                        // both will remain the same.
                                        userUuid = olderUuid = generatedUuid;
                                    } else {
                                        // For existing user, we will still cache
                                        // the older uuid, so that we can improve
                                        // our reporting in terms of figuring out
                                        // the new users accurately.
                                        olderUuid = userUuid;
                                        userUuid  = generatedUuid;
                                    }

                                    PreferencesManager.setViewState("UUID", userUuid);
                                    PreferencesManager.setViewState("OlderUUID", olderUuid);

                                    oneTimeHealthData.uuid      = userUuid;
                                    oneTimeHealthData.olderuuid = olderUuid;
                                    return result.resolve(oneTimeHealthData);
                                });
                            } else {
                                // Probably running on older shell, in which case we will
                                // assign the same uuid to olderuuid.
                                if (!userUuid) {
                                    oneTimeHealthData.uuid = oneTimeHealthData.olderuuid = uuid.v4();
                                } else {
                                    oneTimeHealthData.olderuuid = userUuid;
                                }

                                PreferencesManager.setViewState("UUID",      oneTimeHealthData.uuid);
                                PreferencesManager.setViewState("OlderUUID", oneTimeHealthData.olderuuid);
                                return result.resolve(oneTimeHealthData);
                            }
                        }
                    });

            });
        return result.promise();
    }

    /**
     * will return complete Analyics Data in Json Format
     */
    function getAnalyticsData() {
        return Array.from(sentAnalyticsDataMap.values());
    }

    /**
     * Send data to the server
     */
    function sendHealthDataToServer() {
        var result = new $.Deferred();

        getHealthData().done(function (healthData) {
            if(!window.ga){
                return result.reject();
            }
            SendToAnalytics.sendHealthDataToGA(healthData);
            result.resolve();
        })
            .fail(function () {
                result.reject();
            });

        return result.promise();
    }

    /**
     * Send to google analytics
     * @param{Object} event Object containing Data to be sent to Server
     * {eventName, eventCategory, eventSubCategory, eventType, eventSubType}
     * @returns {*}
     */
    function sendAnalyticsDataToServer(event) {
        var result = new $.Deferred();
        if(!window.ga){
            return result.reject();
        }

        sentAnalyticsDataMap.set(event.eventName, event);
        // ga('send', 'event', ![eventCategory], ![eventAction], [eventLabel], [eventValue/int], [fieldsObject]);
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        window.ga('send', 'event', event.eventCategory, event.eventSubCategory, event.eventType + (event.eventSubType||""));
        if( window.analytics && window.analytics.event) {
            window.analytics.event( event.eventCategory, event.eventSubCategory,
                (event.eventType + (event.eventSubType||"")) || 'none', 1);
        }
        return result.resolve();
    }

    /*
     * Check if the Health Data is to be sent to the server. If the user has enabled tracking, Health Data will be sent once every 24 hours.
     * Send Health Data to the server if the period is more than 24 hours.
     * We are sending the data as soon as the user launches brackets. The data will be sent to the server only after the notification dialog
     * for opt-out/in is closed.
     @param forceSend Flag for sending analytics data for testing purpose
     */
    function checkHealthDataSend(forceSend) {
        var result         = new $.Deferred(),
            isHDTracking   = prefs.get("healthDataTracking"),
            nextTimeToSend,
            currentTime;

        HealthLogger.setHealthLogsEnabled(isHDTracking);
        window.clearTimeout(timeoutVar);
        if (isHDTracking) {
            nextTimeToSend = PreferencesManager.getViewState("nextHealthDataSendTime");
            currentTime    = Date.now();

            // Never send data before FIRST_LAUNCH_SEND_DELAY has ellapsed on a fresh install. This gives the user time to read the notification
            // popup, learn more, and opt out if desired
            if (!nextTimeToSend) {
                nextTimeToSend = currentTime + FIRST_LAUNCH_SEND_DELAY;
                PreferencesManager.setViewState("nextHealthDataSendTime", nextTimeToSend);
                // don't return yet though - still want to set the timeout below
            }

            if (currentTime >= nextTimeToSend || forceSend) {
                // Bump up nextHealthDataSendTime at the begining of chaining to avoid any chance of sending data again before 24 hours, // e.g. if the server request fails or the code below crashes
                PreferencesManager.setViewState("nextHealthDataSendTime", currentTime + ONE_DAY);
                sendHealthDataToServer().always(function() {
                    // We have already sent the health data, so can clear all health data
                    // Logged till now
                    HealthLogger.clearHealthData();
                    result.resolve();
                    timeoutVar = setTimeout(checkHealthDataSend, ONE_DAY);
                });
            } else {
                timeoutVar = setTimeout(checkHealthDataSend, nextTimeToSend - currentTime);
                result.reject();
            }
        } else {
            result.reject();
        }

        return result.promise();
    }

    /**
     * Check if the Analytic Data is to be sent to the server.
     * If the user has enabled tracking, Analytic Data will be sent once per session
     * Send Analytic Data to the server if the Data associated with the given Event is not yet sent in this session.
     * We are sending the data as soon as the user triggers the event.
     * The data will be sent to the server only after the notification dialog
     * for opt-out/in is closed.
     * @param{Object} event event object
     * @param{Object} Eventparams Object containing Data to be sent to Server
     * {eventName, eventCategory, eventSubCategory, eventType, eventSubType}
     * @param{boolean} forceSend Flag for sending analytics data for testing purpose
     **/
    function checkAnalyticsDataSend(event, Eventparams, forceSend) {
        var result         = new $.Deferred(),
            isHDTracking   = prefs.get("healthDataTracking"),
            isEventDataAlreadySent;

        if (isHDTracking) {
            isEventDataAlreadySent = HealthLogger.analyticsEventMap.get(Eventparams.eventName);
            HealthLogger.analyticsEventMap.set(Eventparams.eventName, true);
            if (!isEventDataAlreadySent || forceSend) {
                sendAnalyticsDataToServer(Eventparams)
                    .done(function () {
                        HealthLogger.analyticsEventMap.set(Eventparams.eventName, true);
                        result.resolve();
                    }).fail(function () {
                        HealthLogger.analyticsEventMap.set(Eventparams.eventName, false);
                        result.reject();
                    });
            } else {
                result.reject();
            }
        } else {
            result.reject();
        }

        return result.promise();
    }

    /**
     * This function is auto called after 24 hours to empty the map
     * Map is used to make sure that we send an event only once per 24 hours
     **/

    function emptyAnalyticsMap() {
        HealthLogger.analyticsEventMap.clear();
        setTimeout(emptyAnalyticsMap, ONE_DAY);
    }
    setTimeout(emptyAnalyticsMap, ONE_DAY);

    // Expose a command to test data sending capability, but limit it to dev environment only
    CommandManager.register("Sends health data and Analytics data for testing purpose", "sendHealthData", function() {
        if (brackets.config.environment === "stage") {
            return checkHealthDataSend(true);
        } else {
            return $.Deferred().reject().promise();
        }
    });

    prefs.on("change", "healthDataTracking", function () {
        checkHealthDataSend();
    });

    HealthLogger.on("SendAnalyticsData", checkAnalyticsDataSend);

    window.addEventListener("online", function () {
        checkHealthDataSend();
    });

    window.addEventListener("offline", function () {
        window.clearTimeout(timeoutVar);
    });

    AppInit.appReady(function () {
        checkHealthDataSend();
    });

    exports.getHealthData = getHealthData;
    exports.getAnalyticsData = getAnalyticsData;
    exports.checkHealthDataSend = checkHealthDataSend;
});
