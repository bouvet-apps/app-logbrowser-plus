(function ($, svcUrl) {
    "use strict";

    var $lbScreen, $loadingCursor;
    var g_linesHeight = 0, g_currentLines = [], g_lineHeightPx, g_following = false;
    var g_ws, g_connected, g_keepAliveIntervalId, g_modalActive = false, g_searchText = '', g_searchMatchCase = false,
        g_searchForward = true,
        g_searchRegex = false;

    $(function () {
        $lbScreen = $('.lb-screen');
        $loadingCursor = $('.cursor-blink');

        g_linesHeight = getScreenHeight();
        g_lineHeightPx = $('.lb-logline').first().outerHeight(true);

        $lbScreen.empty();
        window.addEventListener('resize', debounce(
            function () {
                g_linesHeight = getScreenHeight();
                currentPage();
            }, 500)
        );

        fetchLines(g_linesHeight, 0, 'forward');
        $('#upBut').on('click', pageUpClick);
        $('#downBut').on('click', pageDownClick);
        $('#startBut,#startMobBut').on('click', startClick);
        $('#endBut,#endMobBut').on('click', endClick);
        $('#followBut').on('click', followClick);
        $('#stopFollowBut').on('click', stopFollowClick);
        $('#downloadBut').on('click', downloadClick);
        $('#searchBut,#searchMobBut').on('click', searchClick);
        $('.lb-close').on('click', closeSearchClick);
        $('.lb-overlay').on('click', function (e) {
            closeSearchClick(e);
        });
        $('.lb-popup').on('click', function (e) {
            e.stopPropagation();
        });
        $('.lb-search-popup-button').on('click', applySearchClick);
        $('#searchNextBut').on('click', function () {
            g_searchForward = true;
            doSearch();
        });
        $('#searchPrevBut').on('click', function () {
            g_searchForward = false;
            doSearch();
        });
        $('.lb-search-term').keydown(function (e) {
            if (e.keyCode === 13) {
                e.preventDefault();
                applySearchClick(e);
            }
        });

        $(document).keydown(function (e) {
            if (e.keyCode === 27) {
                if ($('#searchModal').hasClass('lb-popup-show')) {
                    $('#searchModal').toggleClass('lb-popup-show', false);
                    g_modalActive = false;
                    return;
                } else if (g_following) {
                    stopFollowLog();
                }
            }

            if (g_modalActive) {
                if (e.keyCode === 70 && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    $('.lb-search-term').select().focus();
                }
                return;
            }
            if (e.keyCode === 34) {
                if (g_following) {
                    return;
                }
                nextPage();

            } else if (e.keyCode === 33) {
                if (g_following) {
                    return;
                }
                previousPage();

            } else if (e.keyCode === 40) {
                if (g_following) {
                    return;
                }
                nextLine();

            } else if (e.keyCode === 38) {
                if (g_following) {
                    return;
                }
                previousLine();

            } else if (e.keyCode === 36) {
                if (g_following) {
                    return;
                }
                firstPage();

            } else if (e.keyCode === 35) {
                if (g_following) {
                    return;
                }
                lastPage();

            } else if (e.keyCode === 70 && e.shiftKey) {
                if (g_following) {
                    return;
                }
                followLog();

            } else if (e.keyCode === 70 && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                searchClick();
            }
        });

        $('#position-slider').on("change",
            debounce(
                function () {
                    var value = $(this).val();
                    seekPosition(value);
                }, 500));

        var lbScreenEl = $lbScreen.get(0);
        if (lbScreenEl.addEventListener) {
            lbScreenEl.addEventListener("mousewheel", onMouseWheel, false); // IE9, Chrome, Safari, Opera
            lbScreenEl.addEventListener("DOMMouseScroll", onMouseWheel, false); // Firefox
        }
    });

    var onMouseWheel = function (e) {
        if (g_following) {
            return true;
        }
        var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
        if (delta > 0) {
            previousLine();
        } else if (delta < 0) {
            nextLine();
        }
        return false;
    };

    var pageUpClick = function (e) {
        if (g_following) {
            return true;
        }
        $(this).blur();

        previousPage();
    };

    var pageDownClick = function (e) {
        if (g_following) {
            return true;
        }
        $(this).blur();

        nextPage();
    };

    var startClick = function (e) {
        if (g_following) {
            return true;
        }
        $(this).blur();

        firstPage();
    };

    var endClick = function (e) {
        if (g_following) {
            return true;
        }
        $(this).blur();

        lastPage();
    };

    var followClick = function (e) {
        if (g_following) {
            return true;
        }
        $(this).blur();

        followLog();
    };

    var stopFollowClick = function (e) {
        if (!g_following) {
            return true;
        }
        $(this).blur();

        stopFollowLog();
    };

    var downloadClick = function (e) {
        e.preventDefault();
        $(this).blur();
        window.location = svcUrl + '?action=download';
    };

    var searchClick = function () {
        $(this).blur();

        $('.lb-search-term').val(g_searchText);
        $('#searchRegex').prop('checked', g_searchRegex);
        $('#searchMatchCase').prop('checked', g_searchMatchCase);
        $('.lb-search-message').css('visibility', 'hidden');

        $('#searchModal').toggleClass('lb-popup-show', true);
        g_modalActive = true;
        $('.lb-search-term').select();
        setTimeout(function () {
            $('.lb-search-term').focus();
        }, 500);
    };

    var closeSearchClick = function (e) {
        e.preventDefault();
        $(this).blur();

        $('#searchModal').toggleClass('lb-popup-show', false);
        g_modalActive = false;
    };

    var applySearchClick = function (e) {
        $(this).blur();

        // $('#searchModal').toggleClass('lb-popup-show', false);
        // g_modalActive = false;

        doSearch();
    };

    var doSearch = function () {
        $('.lb-search-message').css('visibility', 'hidden');
        g_searchText = $('.lb-search-term').val();
        g_searchRegex = $('#searchRegex').is(':checked');
        g_searchMatchCase = $('#searchMatchCase').is(':checked');

        showLines(g_currentLines);

        var firstLine, fromPos;

        if (g_searchForward) {
            if (g_currentLines.length === 0) {
                fromPos = 0;
            } else {
                firstLine = g_currentLines[0];
                fromPos = firstLine.end + 1;
            }
        } else {
            if (g_currentLines.length === 0) {
                fromPos = 0;
            } else {
                firstLine = g_currentLines[0];
                fromPos = firstLine.start - 1;
            }
        }

        fetchLines(g_linesHeight, fromPos, g_searchForward ? 'searchForward' : 'searchBackward', g_searchText);
    };

    var previousPage = function () {
        if (isTopPosition()) {
            return;
        }

        var firstLine, fromPos, action;
        if (g_currentLines.length === 0) {
            fromPos = 0;
        } else {
            firstLine = g_currentLines[0];
            fromPos = firstLine.start - 1;
        }
        action = fromPos <= 0 ? 'forward' : 'backward';
        fetchLines(g_linesHeight, fromPos, action);
    };

    var nextPage = function () {
        var lastLine, fromPos;
        if (g_currentLines.length === 0) {
            fromPos = 0;
        } else {
            lastLine = g_currentLines.slice(-1)[0];
            fromPos = lastLine.end + 1;
        }

        fetchLines(g_linesHeight, fromPos, 'forward');
    };

    var nextLine = function () {
        var firstLine, fromPos;
        if (g_currentLines.length === 0) {
            fromPos = 0;
        } else {
            firstLine = g_currentLines[0];
            fromPos = firstLine.end + 1;
        }

        fetchLines(g_linesHeight, fromPos, 'forward');
    };

    var previousLine = function () {
        if (isTopPosition()) {
            return;
        }

        var lastLine, fromPos, action;
        if (g_currentLines.length === 0) {
            fromPos = 0;
        } else {
            lastLine = g_currentLines.slice(-1)[0];
            fromPos = lastLine.start - 1;
        }
        action = fromPos <= 0 ? 'forward' : 'backward';
        fetchLines(g_linesHeight, fromPos, action);
    };

    var currentPage = function () {
        var firstLine, fromPos;
        if (g_currentLines.length === 0) {
            fromPos = 0;
        } else {
            firstLine = g_currentLines[0];
            fromPos = firstLine.start;
        }
        fetchLines(g_linesHeight, fromPos, 'forward');
    };

    var firstPage = function () {
        fetchLines(g_linesHeight, 0, 'forward');
    };

    var lastPage = function () {
        fetchLines(g_linesHeight, -1, 'end');
    };

    var seekPosition = function (position) {
        fetchLines(g_linesHeight, position, 'seek');
    };

    var followLog = function () {
        g_following = true;
        $('#followBut').hide();
        $('#stopFollowBut').show();

        $loadingCursor.css('visibility', 'visible');
        $lbScreen.toggleClass('lb-following', true).empty();
        $('#position-slider').val(1000).css('visibility', 'hidden');
        $('#startBut,#upBut,#downBut,#endBut,#searchBut,#startMobBut,#endMobBut,#searchMobBut').attr('disabled', true);
        g_currentLines = [];

        wsConnect();
    };

    var stopFollowLog = function () {
        g_following = false;
        $('#followBut').show();
        $('#stopFollowBut').hide();

        $loadingCursor.css('visibility', 'hidden');
        $lbScreen.toggleClass('lb-following', false);
        $('#position-slider').val(1000).css('visibility', 'visible');
        $('#startBut,#upBut,#downBut,#endBut,#searchBut,#startMobBut,#endMobBut,#searchMobBut').attr('disabled', false);

        wsDisconnect();
    };

    var isTopPosition = function () {
        var l = g_currentLines.length;
        if (l === 0) {
            return true;
        }
        return g_currentLines[0].start === 0;
    };
    var getScreenHeight = function () {
        var sh = $lbScreen.outerHeight(true) - 10;
        var lh = $('.lb-logline').first().outerHeight(true);
        var res = Math.floor(sh / lh);
        // console.log(sh + ' / ' + lh + ' = ' + res);
        return res;
    };

    var fetchLines = function (lineCount, fromPos, action, searchText) {
        $loadingCursor.css('visibility', 'visible');
        $.ajax({
            url: svcUrl,
            method: "POST",
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            data: {
                lineCount: lineCount,
                from: fromPos,
                action: action,
                search: searchText,
                regex: g_searchRegex,
                matchCase: g_searchMatchCase
            }
        }).done(function (resp, textStatus, xhr) {
            // console.log(resp);
            $loadingCursor.css('visibility', 'hidden');

            if (action === 'searchForward' || action === 'searchBackward') {
                if (resp.lines.length === 0) {
                    $('.lb-search-message').css('visibility', 'visible');
                    return;
                }
            }

            g_currentLines = resp.lines || [];
            showLines(g_currentLines);
            if (action === 'end') {
                setTimeout(removeTopOverflownRows, 0);
            } else {
                setTimeout(removeOverflownRows, 0);
            }

            var offset = resp.lines.length === 0 ? 0 : resp.lines[0].start;
            var position = resp.size === 0 ? 0 : Math.round((offset / resp.size) * 1000);
            $('#position-slider').val(position);

        }).fail(function (xhr, textStatus) {
            $loadingCursor.css('visibility', 'hidden');
            if (xhr.status === 401) {
                window.location.reload();
            }
        });
    };

    var showLines = function (lines) {
        var lineEl, i, linesEl = [], l = lines.length, lineText, p, part;
        var searchExpr = g_searchRegex ? g_searchText : escapeRegExp(g_searchText);
        var searchRegexp = new RegExp('(' + searchExpr + ')', g_searchMatchCase ? 'g' : 'gi');
        for (i = 0; i < l; i++) {
            lineText = lines[i].value;
            if (g_searchText) {
                var parts = lineText.split(searchRegexp);

                var lineParts = [];
                for (p = 0; p < parts.length; p++) {
                    part = parts[p];
                    if (searchRegexp.test(part)) {
                        lineParts.push($('<mark>').text(part));
                    } else {
                        lineParts.push(document.createTextNode(part));
                    }
                }
                lineEl = $('<span/>').addClass('lb-logline').append(lineParts);
            } else {
                lineEl = $('<span/>').addClass('lb-logline').text(lineText);
            }
            linesEl.push(lineEl);
        }
        $lbScreen.empty().append(linesEl);
    };

    var debounce = function (func, wait, immediate) {
        var timeout;
        return function () {
            var context = this, args = arguments;
            var later = function () {
                timeout = null;
                if (!immediate) {
                    func.apply(context, args);
                }
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) {
                func.apply(context, args);
            }
        };
    };

    var removeOverflownRows = function () {
        var rows = $lbScreen.children(), r, l = rows.length, row;
        if (l <= 1) {
            return;
        }
        var clientHeight = window.innerHeight || document.documentElement.clientHeight;
        var clientWidth = window.innerWidth || document.documentElement.clientWidth;
        for (r = l - 1; r >= 0; r--) {
            row = rows[r];
            var rect = row.getBoundingClientRect();
            var isRowVisible = rect.bottom <= clientHeight && rect.right <= clientWidth;
            if (isRowVisible) {
                break;
            }
            // rows[r].remove();
            g_currentLines.pop();
        }
    };

    var removeTopOverflownRows = function () {
        var rows = $lbScreen.children(), r, l = rows.length, row;
        if (l <= 1) {
            return;
        }

        var lineCount = 0;
        for (r = l - 1; r >= 0; r--) {
            row = rows[r];
            var rect = row.getBoundingClientRect();
            lineCount += Math.ceil(rect.height / g_lineHeightPx);
            if (lineCount > g_linesHeight) {
                break;
            }
        }

        for (; r >= 0; r--) {
            rows[r].remove();
            g_currentLines.splice(r, 1);
        }
    };

    // WS - EVENTS

    var wsConnect = function () {
        g_ws = new WebSocket(getWebSocketUrl(svcUrl, g_linesHeight), ['logbrowser']);
        g_ws.onopen = onWsOpen;
        g_ws.onclose = onWsClose;
        g_ws.onmessage = onWsMessage;
    };

    var wsDisconnect = function () {
        clearInterval(g_keepAliveIntervalId);
        if (g_ws) {
            g_connected = false;
            g_ws.onclose = undefined;
            g_ws.close();
        }
    };

    var onWsOpen = function () {
        // console.log('connect WS');
        g_keepAliveIntervalId = setInterval(function () {
            if (g_connected) {
                g_ws.send('{"action":"KeepAlive"}');
            }
        }, 30 * 1000);
        g_connected = true;
    };

    var onWsClose = function () {
        clearInterval(g_keepAliveIntervalId);
        g_connected = false;

        setTimeout(wsConnect, 5000); // attempt to reconnect
    };

    var onWsMessage = function (event) {
        var resp = JSON.parse(event.data);
        // console.log(resp);

        g_currentLines = g_currentLines.concat(resp.lines);
        if (g_currentLines.length > g_linesHeight) {
            g_currentLines.splice(0, g_linesHeight - g_currentLines.length);
        }
        showLines(g_currentLines);
        setTimeout(removeTopOverflownRows, 0);
    };

    var getWebSocketUrl = function (path, lineCount) {
        var l = window.location;
        return ((l.protocol === "https:") ? "wss://" : "ws://") + l.host + path + '?lineCount=' + lineCount;
    };

    var escapeRegExp = function (str) {
        return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    };

}($, SVC_URL));
