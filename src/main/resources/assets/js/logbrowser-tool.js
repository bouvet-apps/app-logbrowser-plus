(function ($, svcUrl) {
    "use strict";

    var $lbScreen, $loadingCursor;
    var g_linesHeight = 0, g_currentLines = [], g_lineHeightPx, g_following = false;
    var g_ws, g_connected, g_keepAliveIntervalId, g_modalActive = false, g_searchText = '', g_searchMatchCase = false,
        g_searchForward = true,
        g_searchRegex = false;

    // State model for filtering and grouping
    var g_activeFilters = new Set(['error', 'warn', 'info', 'debug', 'trace']); // Active severity levels: 'error', 'warn', 'info', 'debug', 'trace'
    var g_groupedEvents = []; // Array of event objects: { headerIdx, indices[], severity, isCollapsed, eventId }
    var g_collapseAll = false; // Global collapse flag: when true, all multi-line events are collapsed by default
    var g_collapsedEvents = new Map(); // Per-event exceptions to g_collapseAll (eventId -> isCollapsed)
    var g_eventCounts = {  // Counts by level
        total: 0,
        error: 0,
        warn: 0,
        info: 0,
        debug: 0,
        trace: 0,
        other: 0
    };
    var g_globalEventCounts = null;
    var g_lastStatsFetchAt = 0;
    var g_isFillingFilteredWindow = false;

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
        fetchGlobalStats(true);
        bindFilterChips();
        bindCollapseControls();
        bindEventHeaderToggle();
        updateFilterChipUi();
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

        // Expand any collapsed events containing the search match so it's visible
        expandEventsMatchingSearch();

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

    var expandEventsMatchingSearch = function () {
        if (!g_searchText || g_groupedEvents.length === 0) {
            return;
        }

        var searchExpr = g_searchRegex ? g_searchText : escapeRegExp(g_searchText);
        var flags = g_searchMatchCase ? '' : 'i';
        var re;
        try {
            re = new RegExp(searchExpr, flags);
        } catch (e) {
            return;
        }

        var i, j, eventItem, line;
        for (i = 0; i < g_groupedEvents.length; i++) {
            eventItem = g_groupedEvents[i];
            if (!eventItem.isCollapsed || eventItem.indices.length <= 1) {
                continue;
            }
            for (j = 0; j < eventItem.indices.length; j++) {
                line = g_currentLines[eventItem.indices[j]];
                if (line && line.value && re.test(line.value)) {
                    eventItem.isCollapsed = false;
                    if (g_collapseAll) {
                        g_collapsedEvents.set(eventItem.eventId, false);
                    } else {
                        g_collapsedEvents.delete(eventItem.eventId);
                    }
                    break;
                }
            }
        }
    };

    var previousPage = function () {
        if (isSelectiveFilterActive()) {
            jumpToFilteredMatch('backward');
            return;
        }

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
        if (isSelectiveFilterActive()) {
            jumpToFilteredMatch('forward');
            return;
        }

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
        if (isSelectiveFilterActive()) {
            jumpToFilteredMatch('forward');
            return;
        }

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
        if (isSelectiveFilterActive()) {
            jumpToFilteredMatch('backward');
            return;
        }

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
        $('.lb-sidebar').addClass('lb-sidebar-following');
        g_currentLines = [];
        rebuildGroupedState(g_currentLines);

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
        $('.lb-sidebar').removeClass('lb-sidebar-following');

        wsDisconnect();

        // Refresh: load the last page and update stats
        fetchLines(g_linesHeight, -1, 'end');
        fetchGlobalStats(true);
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
            rebuildGroupedState(g_currentLines);

            if (g_searchText && (action === 'searchForward' || action === 'searchBackward')) {
                expandEventsMatchingSearch();
            }

            var visibleCount = showLines(g_currentLines);

            if (visibleCount === 0 && isSelectiveFilterActive() && action !== 'searchForward' && action !== 'searchBackward') {
                if (action === 'backward') {
                    jumpToFilteredMatch('backward');
                } else {
                    jumpToFilteredMatch('forward');
                }
                return;
            }

            if (isSelectiveFilterActive()) {
                fillFilteredViewport(visibleCount);
            } else if (g_collapseAll) {
                fillCollapsedViewport(visibleCount);
            } else if (action === 'end') {
                setTimeout(removeTopOverflownRows, 0);
            } else {
                setTimeout(removeOverflownRows, 0);
            }

            var offset = resp.lines.length === 0 ? 0 : resp.lines[0].start;
            var position = resp.size === 0 ? 0 : Math.round((offset / resp.size) * 1000);
            $('#position-slider').val(position);

            fetchGlobalStats(false);

        }).fail(function (xhr, textStatus) {
            $loadingCursor.css('visibility', 'hidden');
            if (xhr.status === 401) {
                window.location.reload();
            }
        });
    };

    var showLines = function (lines) {
        var linesEl = [];
        var events = g_groupedEvents && g_groupedEvents.length ? g_groupedEvents : groupLines(lines || []);
        var searchExpr = g_searchRegex ? g_searchText : escapeRegExp(g_searchText);
        var searchRegexp = new RegExp('(' + searchExpr + ')', g_searchMatchCase ? 'g' : 'gi');
        var eventIdx, lineIdx, eventItem, rowIndex, rowLine, rowText, lineEl, lineParts, part, p, lineClasses, levelClass;

        for (eventIdx = 0; eventIdx < events.length; eventIdx++) {
            eventItem = events[eventIdx];
            if (!isEventVisible(eventItem)) {
                continue;
            }
            levelClass = getSeverityClass(eventItem.severity);
            var collapsedLinesCount = Math.max(0, eventItem.indices.length - 1);

            for (lineIdx = 0; lineIdx < eventItem.indices.length; lineIdx++) {
                if (eventItem.isCollapsed && lineIdx > 0) {
                    continue;
                }

                rowIndex = eventItem.indices[lineIdx];
                rowLine = lines[rowIndex];
                if (!rowLine) {
                    continue;
                }

                rowText = rowLine.value;
                lineClasses = 'lb-logline ' + (lineIdx === 0 ? 'lb-event-header' : 'lb-event-line') + (levelClass ? (' ' + levelClass) : '');
                if (lineIdx === 0 && eventItem.isCollapsed) {
                    lineClasses += ' lb-event-collapsed';
                }

                if (lineIdx === 0 && collapsedLinesCount > 0) {
                    rowText = (eventItem.isCollapsed ? '▶ ' : '▼ ') + rowText;
                    if (eventItem.isCollapsed) {
                        rowText += '  (+' + collapsedLinesCount + ' lines)';
                    }
                }

                // For event headers, parse and style timestamp/level separately
                if (lineIdx === 0) {
                    var headerParts = formatHeaderLine(rowText, g_searchText, g_searchMatchCase, g_searchRegex);
                    lineEl = $('<span/>').addClass(lineClasses).append(headerParts);
                } else if (g_searchText) {
                    // For body lines with search, use search highlighting
                    lineParts = [];
                    var parts = rowText.split(searchRegexp);

                    for (p = 0; p < parts.length; p++) {
                        part = parts[p];
                        if (searchRegexp.test(part)) {
                            lineParts.push($('<mark>').text(part));
                        } else {
                            lineParts.push(document.createTextNode(part));
                        }
                    }

                    lineEl = $('<span/>').addClass(lineClasses).append(lineParts);
                } else {
                    lineEl = $('<span/>').addClass(lineClasses).text(rowText);
                }

                lineEl.attr('data-event-id', eventItem.eventId);
                lineEl.attr('data-event-index', eventIdx);
                lineEl.attr('data-line-index', lineIdx);
                lineEl.attr('data-severity', eventItem.severity || 'other');

                linesEl.push(lineEl);
            }
        }

        $lbScreen.empty().append(linesEl);
        return linesEl.length;
    };

    var bindCollapseControls = function () {
        $('#collapseAllBut').on('click', function () {
            g_collapseAll = true;
            g_collapsedEvents.clear();
            rebuildGroupedState(g_currentLines);
            var visibleCount = showLines(g_currentLines);
            fillCollapsedViewport(visibleCount);
        });

        $('#expandAllBut').on('click', function () {
            g_collapseAll = false;
            g_collapsedEvents.clear();
            rebuildGroupedState(g_currentLines);
            showLines(g_currentLines);
        });
    };

    var bindEventHeaderToggle = function () {
        $lbScreen.on('click', '.lb-event-header', function () {
            var eventId = $(this).attr('data-event-id');
            if (!eventId) {
                return;
            }

            var i, eventItem;
            for (i = 0; i < g_groupedEvents.length; i++) {
                if (g_groupedEvents[i].eventId === eventId) {
                    eventItem = g_groupedEvents[i];
                    break;
                }
            }
            if (!eventItem) {
                return;
            }

            var newCollapsed = !eventItem.isCollapsed;
            // Store as exception only if it differs from the global default
            if (newCollapsed !== g_collapseAll) {
                g_collapsedEvents.set(eventId, newCollapsed);
            } else {
                g_collapsedEvents.delete(eventId);
            }
            eventItem.isCollapsed = newCollapsed;

            var visibleCount = showLines(g_currentLines);
            if (newCollapsed) {
                fillCollapsedViewport(visibleCount);
            }
        });
    };

    var isCollapsedViewActive = function () {
        return g_collapseAll || g_collapsedEvents.size > 0;
    };

    var fillCollapsedViewport = function (visibleCount) {
        if (!g_collapseAll || g_isFillingFilteredWindow) {
            return;
        }
        if (visibleCount >= g_linesHeight || g_currentLines.length === 0) {
            return;
        }

        g_isFillingFilteredWindow = true;
        var attempts = 0;
        var maxAttempts = 6;
        var minVisibleRows = Math.max(1, g_linesHeight - 1);

        var loadMore = function (currentVisibleCount) {
            if (currentVisibleCount >= minVisibleRows || attempts >= maxAttempts || g_currentLines.length === 0) {
                g_isFillingFilteredWindow = false;
                return;
            }

            attempts += 1;
            var lastLine = g_currentLines[g_currentLines.length - 1];
            var fromPos = lastLine && lastLine.end !== undefined ? (lastLine.end + 1) : 0;

            $.ajax({
                url: svcUrl,
                method: 'POST',
                contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                data: {
                    lineCount: g_linesHeight,
                    from: fromPos,
                    action: 'forward'
                }
            }).done(function (resp) {
                if (!resp || !resp.lines || resp.lines.length === 0) {
                    g_isFillingFilteredWindow = false;
                    return;
                }

                g_currentLines = g_currentLines.concat(resp.lines);
                if (g_currentLines.length > g_linesHeight * 20) {
                    g_currentLines = g_currentLines.slice(g_currentLines.length - (g_linesHeight * 20));
                }
                rebuildGroupedState(g_currentLines);
                var renderedCount = showLines(g_currentLines);
                loadMore(renderedCount);
            }).fail(function () {
                g_isFillingFilteredWindow = false;
            });
        };

        loadMore(visibleCount);
    };

    var bindFilterChips = function () {
        $('.lb-filter-chip').on('click', function () {
            var level = $(this).data('level');
            if (!level) {
                return;
            }

            if (g_activeFilters.has(level)) {
                g_activeFilters.delete(level);
            } else {
                g_activeFilters.add(level);
            }

            if (g_activeFilters.size === 0) {
                g_activeFilters = new Set(['error', 'warn', 'info', 'debug', 'trace']);
            }

            updateFilterChipUi();
            var visibleCount = showLines(g_currentLines);
            if (visibleCount === 0) {
                jumpToFilteredMatch('forward');
            } else if (isSelectiveFilterActive()) {
                fillFilteredViewport(visibleCount);
            } else if (g_collapseAll) {
                fillCollapsedViewport(visibleCount);
            }
        });
    };

    var updateFilterChipUi = function () {
        $('.lb-filter-chip').each(function () {
            var level = $(this).data('level');
            $(this).toggleClass('active', g_activeFilters.has(level));
        });
    };

    var isEventVisible = function (eventItem) {
        if (!eventItem || !eventItem.severity) {
            return true;
        }

        var allFiltersSelected = g_activeFilters.size === 5;

        if (eventItem.severity === 'other') {
            return allFiltersSelected;
        }

        if (allFiltersSelected) {
            return true;
        }

        return g_activeFilters.has(eventItem.severity);
    };

    var buildFilterSearchPattern = function () {
        if (g_activeFilters.size === 5) {
            return null;
        }

        var levelTokens = [];
        if (g_activeFilters.has('error')) {
            levelTokens.push('ERROR', 'FATAL', 'SEVERE');
        }
        if (g_activeFilters.has('warn')) {
            levelTokens.push('WARN', 'WARNING');
        }
        if (g_activeFilters.has('info')) {
            levelTokens.push('INFO');
        }
        if (g_activeFilters.has('debug')) {
            levelTokens.push('DEBUG');
        }
        if (g_activeFilters.has('trace')) {
            levelTokens.push('TRACE');
        }

        if (levelTokens.length === 0) {
            return null;
        }

        return '(^|\\W)(' + levelTokens.join('|') + ')(\\W|$)';
    };

    var isSelectiveFilterActive = function () {
        return g_activeFilters.size < 5;
    };

    var jumpToFilteredMatch = function (direction) {
        var searchPattern = buildFilterSearchPattern();
        if (!searchPattern) {
            return;
        }

        var fromPos = 0;
        var searchAction = direction === 'backward' ? 'searchBackward' : 'searchForward';
        if (g_currentLines.length > 0) {
            if (direction === 'backward') {
                fromPos = g_currentLines[0].start - 1;
            } else {
                fromPos = g_currentLines[g_currentLines.length - 1].end + 1;
            }
        }

        fetchFilteredWindow(searchPattern, fromPos, searchAction, false);
    };

    var fetchFilteredWindow = function (searchPattern, fromPos, searchAction, retriedFromBoundary) {
        $loadingCursor.css('visibility', 'visible');
        $.ajax({
            url: svcUrl,
            method: "POST",
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            data: {
                lineCount: g_linesHeight,
                from: fromPos,
                action: searchAction,
                search: searchPattern,
                regex: true,
                matchCase: false
            }
        }).done(function (resp) {
            $loadingCursor.css('visibility', 'hidden');

            if (!resp || !resp.lines || resp.lines.length === 0) {
                if (!retriedFromBoundary) {
                    var retryFrom = searchAction === 'searchBackward' ? -1 : 0;
                    fetchFilteredWindow(searchPattern, retryFrom, searchAction, true);
                }
                return;
            }

            g_currentLines = resp.lines || [];
            rebuildGroupedState(g_currentLines);
            var visibleCount = showLines(g_currentLines);
            if (isSelectiveFilterActive()) {
                fillFilteredViewport(visibleCount);
            } else if (g_collapseAll) {
                fillCollapsedViewport(visibleCount);
            } else if (searchAction === 'searchBackward') {
                setTimeout(removeTopOverflownRows, 0);
            } else {
                setTimeout(removeOverflownRows, 0);
            }

            var offset = resp.lines.length === 0 ? 0 : resp.lines[0].start;
            var position = resp.size === 0 ? 0 : Math.round((offset / resp.size) * 1000);
            $('#position-slider').val(position);
        }).fail(function () {
            $loadingCursor.css('visibility', 'hidden');
        });
    };

    var fillFilteredViewport = function (visibleCount) {
        if (!isSelectiveFilterActive() || g_isFillingFilteredWindow) {
            return;
        }
        if (visibleCount >= g_linesHeight || g_currentLines.length === 0) {
            return;
        }

        g_isFillingFilteredWindow = true;

        var attempts = 0;
        var maxAttempts = 6;
        var minVisibleRows = Math.max(1, g_linesHeight - 1);

        var loadMore = function (currentVisibleCount) {
            if (currentVisibleCount >= minVisibleRows || attempts >= maxAttempts || g_currentLines.length === 0) {
                g_isFillingFilteredWindow = false;
                return;
            }

            attempts += 1;
            var lastLine = g_currentLines[g_currentLines.length - 1];
            var fromPos = lastLine && lastLine.end !== undefined ? (lastLine.end + 1) : 0;

            $.ajax({
                url: svcUrl,
                method: "POST",
                contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                data: {
                    lineCount: g_linesHeight,
                    from: fromPos,
                    action: 'forward'
                }
            }).done(function (resp) {
                if (!resp || !resp.lines || resp.lines.length === 0) {
                    g_isFillingFilteredWindow = false;
                    return;
                }

                g_currentLines = g_currentLines.concat(resp.lines);
                if (g_currentLines.length > g_linesHeight * 20) {
                    g_currentLines = g_currentLines.slice(g_currentLines.length - (g_linesHeight * 20));
                }
                rebuildGroupedState(g_currentLines);
                var renderedCount = showLines(g_currentLines);

                loadMore(renderedCount);
            }).fail(function () {
                g_isFillingFilteredWindow = false;
            });
        };

        loadMore(visibleCount);
    };

    var rebuildGroupedState = function (lines) {
        g_groupedEvents = groupLines(lines || []);
        g_eventCounts = buildEventCounts(g_groupedEvents);
        updateSidebarCounts();
    };

    var parseLevel = function (lineText) {
        var text = lineText || '';
        var match = text.match(/(^|\W)(ERROR|FATAL|SEVERE|WARN|WARNING|INFO|DEBUG|TRACE)(\W|$)/);
        if (!match || !match[2]) {
            if (/^[A-Za-z0-9_.$]+(?:Exception|Error)(?::|\b)/.test(text)) {
                return 'error';
            }
            return 'other';
        }

        var token = match[2];
        if (token === 'WARN' || token === 'WARNING') {
            return 'warn';
        }
        if (token === 'ERROR' || token === 'FATAL' || token === 'SEVERE') {
            return 'error';
        }
        if (token === 'INFO') {
            return 'info';
        }
        if (token === 'DEBUG') {
            return 'debug';
        }
        if (token === 'TRACE') {
            return 'trace';
        }

        return 'other';
    };

    var isEventStart = function (lineText) {
        if (!lineText) {
            return false;
        }

        if (isContinuationLine(lineText)) {
            return false;
        }

        if (/^\d{4}[-\/]\d{2}[-\/]\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(lineText)) {
            return true;
        }

        return parseLevel(lineText) !== 'other';
    };

    var isContinuationLine = function (lineText) {
        if (!lineText) {
            return false;
        }

        return /^\s+at\s+/.test(lineText) ||
            /^\s*Caused by:/.test(lineText) ||
            /^\s*\.\.\.\s+\d+\s+more/.test(lineText) ||
            /^[A-Za-z0-9_.$]+(?:Exception|Error)(?::|\b)/.test(lineText);
    };

    var groupLines = function (lines) {
        var grouped = [];
        var currentEvent = null;
        var i, line, lineText;

        for (i = 0; i < lines.length; i++) {
            line = lines[i];
            lineText = line && line.value ? line.value : '';

            if (!currentEvent || isEventStart(lineText)) {
                var eventId = (line && line.start !== undefined ? line.start : i) + ':' + (line && line.end !== undefined ? line.end : i);
                var severity = parseLevel(lineText);
                if (!currentEvent && severity === 'other' && isContinuationLine(lineText)) {
                    severity = 'error';
                }
                var collapseException = g_collapsedEvents.get(eventId);
                var isCollapsed = collapseException !== undefined ? collapseException : g_collapseAll;
                currentEvent = {
                    eventId: eventId,
                    headerIdx: i,
                    indices: [i],
                    severity: severity,
                    isCollapsed: isCollapsed
                };
                grouped.push(currentEvent);
            } else {
                currentEvent.indices.push(i);
            }
        }

        return grouped;
    };

    var buildEventCounts = function (events) {
        var counts = {
            total: events.length,
            error: 0,
            warn: 0,
            info: 0,
            debug: 0,
            trace: 0,
            other: 0
        };
        var i, severity;

        for (i = 0; i < events.length; i++) {
            severity = events[i].severity || 'other';
            if (counts[severity] === undefined) {
                counts.other += 1;
            } else {
                counts[severity] += 1;
            }
        }

        return counts;
    };

    var getSeverityClass = function (severity) {
        if (severity === 'error') {
            return 'lb-logline-error';
        }
        if (severity === 'warn') {
            return 'lb-logline-warn';
        }
        if (severity === 'info') {
            return 'lb-logline-info';
        }
        if (severity === 'debug') {
            return 'lb-logline-debug';
        }
        if (severity === 'trace') {
            return 'lb-logline-trace';
        }

        return '';
    };

    var updateSidebarCounts = function () {
        var sourceCounts = g_globalEventCounts || g_eventCounts;
        $('[data-count-type="total"]').text(sourceCounts.total || 0);
        $('[data-count-type="error"]').text(sourceCounts.error || 0);
        $('[data-count-type="warn"]').text(sourceCounts.warn || 0);
        $('[data-count-type="info"]').text(sourceCounts.info || 0);
        $('[data-count-type="debug"]').text(sourceCounts.debug || 0);
        $('[data-count-type="trace"]').text(sourceCounts.trace || 0);
    };

    var fetchGlobalStats = function (force) {
        var now = Date.now();
        if (!force && now - g_lastStatsFetchAt < 5000) {
            return;
        }
        g_lastStatsFetchAt = now;

        $.ajax({
            url: svcUrl,
            method: "POST",
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            data: {
                action: 'stats'
            }
        }).done(function (resp) {
            if (!resp || !resp.success || !resp.counts) {
                return;
            }
            g_globalEventCounts = {
                total: resp.counts.total || 0,
                error: resp.counts.error || 0,
                warn: resp.counts.warn || 0,
                info: resp.counts.info || 0,
                debug: resp.counts.debug || 0,
                trace: resp.counts.trace || 0,
                other: resp.counts.other || 0
            };
            updateSidebarCounts();
        }).fail(function () {
        });
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
        rebuildGroupedState(g_currentLines);
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
        rebuildGroupedState(g_currentLines);
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
        // Keep more lines when collapsed/filtered since many are hidden
        var maxBuffer = (g_collapseAll || isSelectiveFilterActive()) ? g_linesHeight * 10 : g_linesHeight;
        if (g_currentLines.length > maxBuffer) {
            g_currentLines.splice(0, g_currentLines.length - maxBuffer);
        }
        rebuildGroupedState(g_currentLines);
        var visibleCount = showLines(g_currentLines);
        if (isSelectiveFilterActive()) {
            // No async fill during follow — buffer is already larger
        } else if (g_collapseAll) {
            // No async fill during follow — buffer is already larger
        } else {
            setTimeout(removeTopOverflownRows, 0);
        }
    };

    var getWebSocketUrl = function (path, lineCount) {
        var l = window.location;
        return ((l.protocol === "https:") ? "wss://" : "ws://") + l.host + path + '?lineCount=' + lineCount;
    };

    var escapeRegExp = function (str) {
        return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    };

    var formatHeaderLine = function (text, searchText, searchMatchCase, searchRegex) {
        // Parse typical log format: [▶/▼] TIMESTAMP LEVEL [LOGGER] MESSAGE
        // Returns array of DOM elements for collapse indicator, timestamp, level, and message parts
        var parts = [];
        var remaining = text;

        // Strip optional collapse indicator (▶ or ▼)
        var collapseMatch = remaining.match(/^([▶▼]\s)/);
        if (collapseMatch) {
            parts.push(document.createTextNode(collapseMatch[1]));
            remaining = remaining.substring(collapseMatch[0].length);
        }

        // Match time-only (00:03:00.246) or full date-time (2024-03-09 12:30:45.123 or 2024-03-09T12:30:45.123)
        var timestampMatch = remaining.match(/^(\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)(\s+)/) ||
            remaining.match(/^(\d{4}[-\/]\d{2}[-\/]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)(\s+)/);
        if (timestampMatch) {
            parts.push($('<span class="lb-timestamp">').text(timestampMatch[1] + timestampMatch[2]));
            remaining = remaining.substring(timestampMatch[0].length);
        }

        var levelMatch = remaining.match(/^(\s*\[?(ERROR|FATAL|SEVERE|WARN|WARNING|INFO|DEBUG|TRACE)\]?\s+)/);
        if (levelMatch) {
            parts.push($('<span class="lb-level">').text(levelMatch[1]));
            remaining = remaining.substring(levelMatch[0].length);
        }

        if (searchText) {
            var searchExpr = searchRegex ? searchText : escapeRegExp(searchText);
            var searchRegexp = new RegExp('(' + searchExpr + ')', searchMatchCase ? 'g' : 'gi');
            var searchParts = remaining.split(searchRegexp);
            for (var p = 0; p < searchParts.length; p++) {
                var part = searchParts[p];
                if (searchRegexp.test(part)) {
                    parts.push($('<mark>').text(part));
                } else {
                    parts.push(document.createTextNode(part));
                }
            }
        } else {
            parts.push(document.createTextNode(remaining));
        }

        return parts;
    };

}($, SVC_URL));
