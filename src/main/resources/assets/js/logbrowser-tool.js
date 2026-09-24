(function ($, svcUrl) {
    "use strict";

    var $lbScreen, $loadingCursor;
    var g_linesHeight = 0, g_currentLines = [], g_lineHeightPx, g_following = false;
    var g_ws, g_connected, g_keepAliveIntervalId, g_modalActive = false, g_searchText = '', g_searchMatchCase = false,
        g_searchForward = true,
        g_searchRegex = false;

    // Log-level grouping/folding/highlighting (Log Browser Plus additions)
    var LEVEL_KEYWORD_RE = /\b(TRACE|DEBUG|INFO|WARN|ERROR)\b/;
    var CONTINUATION_START_RE = /^(\s|Caused by:|\.\.\.\s*\d+\s+more)/;
    var STACK_FRAME_RE = /^\s*at\s+([\w$.]+)\(([^)]*)\)/;
    var DEFAULT_ORIGIN_SKIP_PREFIXES = ['java.', 'javax.', 'jdk.', 'sun.', 'com.enonic.', 'org.eclipse.',
        'org.graalvm.', 'com.oracle.truffle.', 'org.jruby.', 'groovy.', 'kotlin.', 'scala.', 'org.mvel2.'];

    var g_infoHide = false, g_infoMinimize = false;
    var g_warnHide = false, g_warnMinimize = true, g_errorHide = false, g_errorMinimize = false;
    var g_originSkipPrefixes = loadOriginSkipPrefixes();
    var g_lastEntries = []; // entries (incl. hidden) computed by the most recent showLines() call

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

        loadLevelFilterSettings();
        $('#infoHideChk').prop('checked', g_infoHide).on('change', onLevelFilterChange);
        $('#infoMinimizeChk').prop('checked', g_infoMinimize).on('change', onLevelFilterChange);
        $('#warnHideChk').prop('checked', g_warnHide).on('change', onLevelFilterChange);
        $('#warnMinimizeChk').prop('checked', g_warnMinimize).on('change', onLevelFilterChange);
        $('#errorHideChk').prop('checked', g_errorHide).on('change', onLevelFilterChange);
        $('#errorMinimizeChk').prop('checked', g_errorMinimize).on('change', onLevelFilterChange);
        $('#originSkipInput').val(g_originSkipPrefixes.join(', ')).on('change', onOriginSkipInputChange);

        $lbScreen.on('click', '.lb-entry-toggle', onEntryToggleClick);

        fetchLines(g_linesHeight, 0, 'forward');
        $('#upBut').on('click', pageUpClick);
        $('#downBut').on('click', pageDownClick);
        $('#startBut,#startMobBut').on('click', startClick);
        $('#endBut,#endMobBut').on('click', endClick);
        $('#followBut').on('click', followClick);
        $('#stopFollowBut').on('click', stopFollowClick);
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

    var buildTextNodes = function (text, searchRegexp) {
        var p, part;
        if (!g_searchText) {
            return [document.createTextNode(text)];
        }
        var parts = text.split(searchRegexp);
        var nodes = [];
        for (p = 0; p < parts.length; p++) {
            part = parts[p];
            if (searchRegexp.test(part)) {
                nodes.push($('<mark>').text(part).get(0));
            } else {
                nodes.push(document.createTextNode(part));
            }
        }
        return nodes;
    };

    var buildLineEl = function (lineText, searchRegexp) {
        return $('<span/>').addClass('lb-logline').append(buildTextNodes(lineText, searchRegexp));
    };

    // Renders the header line with its level keyword (INFO/WARN/ERROR/...) wrapped in
    // a colored, bold span, so the level is easy to scan even though the level accent
    // border on the entry itself is subtle at a glance.
    var buildHeaderLineEl = function (headerText, searchRegexp) {
        var m = LEVEL_KEYWORD_RE.exec(headerText.substring(0, 80));
        if (!m) {
            return buildLineEl(headerText, searchRegexp);
        }
        var prefix = headerText.substring(0, m.index);
        var levelWord = m[1];
        var suffix = headerText.substring(m.index + levelWord.length);
        var $lineEl = $('<span/>').addClass('lb-logline')
            .append(buildTextNodes(prefix, searchRegexp))
            .append($('<span/>').addClass('lb-level-word lb-level-word-' + levelWord.toLowerCase())
                .append(buildTextNodes(levelWord, searchRegexp)))
            .append(buildTextNodes(suffix, searchRegexp));
        return $lineEl;
    };

    // A log entry is a header line (timestamp + level) plus any following lines that
    // don't look like a new header (stack frames, multiline exception messages).
    var detectHeaderLevel = function (text) {
        if (CONTINUATION_START_RE.test(text)) {
            return null;
        }
        var m = LEVEL_KEYWORD_RE.exec(text.substring(0, 80));
        return m ? m[1] : null;
    };

    var groupEntries = function (lines) {
        var entries = [], current = null, i, level;
        for (i = 0; i < lines.length; i++) {
            level = detectHeaderLevel(lines[i].value);
            if (level || !current) {
                current = {level: level || 'INFO', lines: [lines[i]], startIdx: i, endIdx: i};
                entries.push(current);
            } else {
                current.lines.push(lines[i]);
                current.endIdx = i;
            }
        }
        return entries;
    };

    var isEntryHidden = function (entry) {
        return (entry.level === 'INFO' && g_infoHide) || (entry.level === 'WARN' && g_warnHide) ||
            (entry.level === 'ERROR' && g_errorHide);
    };

    var isEntryMinimizedByDefault = function (entry) {
        return (entry.level === 'INFO' && g_infoMinimize) || (entry.level === 'WARN' && g_warnMinimize) ||
            (entry.level === 'ERROR' && g_errorMinimize);
    };

    var matchesAnyPrefix = function (fqcn, prefixes) {
        for (var p = 0; p < prefixes.length; p++) {
            if (prefixes[p] && fqcn.indexOf(prefixes[p]) === 0) {
                return true;
            }
        }
        return false;
    };

    // Walks the stack frames of an entry (skipping the header) and returns the index
    // (within entry.lines) of the first frame that isn't in the ignore-prefix list -
    // i.e. our best guess at "where in our own code this actually happened".
    var findOriginFrameIndex = function (entry) {
        var i, m;
        for (i = 1; i < entry.lines.length; i++) {
            m = STACK_FRAME_RE.exec(entry.lines[i].value);
            if (m && !matchesAnyPrefix(m[1], g_originSkipPrefixes)) {
                return i;
            }
        }
        return -1;
    };

    var buildEntryEl = function (entry, searchRegexp) {
        var $container = $('<div/>').addClass('lb-entry lb-entry-' + entry.level.toLowerCase());
        var $header = buildHeaderLineEl(entry.lines[0].value, searchRegexp);
        var originFrameIdx = entry.lines.length > 1 ? findOriginFrameIndex(entry) : -1;

        if (originFrameIdx > 0) {
            var frameMatch = STACK_FRAME_RE.exec(entry.lines[originFrameIdx].value);
            $header.append($('<span/>').addClass('lb-entry-origin').text('→ ' + frameMatch[2]));
        }

        if (entry.lines.length === 1) {
            $container.append($header);
            return $container;
        }

        var collapsed = isEntryMinimizedByDefault(entry);
        var $toggle = $('<span/>').addClass('lb-entry-toggle')
            .text((collapsed ? '▶' : '▼') + ' Stack trace (' + (entry.lines.length - 1) + ' lines)');
        var $body = $('<div/>').addClass('lb-entry-body');
        if (!collapsed) {
            $body.addClass('lb-entry-body-expanded');
        }
        for (var i = 1; i < entry.lines.length; i++) {
            var $line = buildLineEl(entry.lines[i].value, searchRegexp);
            if (i === originFrameIdx) {
                $line.addClass('lb-origin-frame');
            }
            $body.append($line);
        }

        $container.append($header).append($toggle).append($body);
        return $container;
    };

    var onEntryToggleClick = function () {
        var $toggle = $(this);
        var $body = $toggle.next('.lb-entry-body');
        var expanded = $body.toggleClass('lb-entry-body-expanded').hasClass('lb-entry-body-expanded');
        var lineCount = $body.children().length;
        $toggle.text((expanded ? '▼' : '▶') + ' Stack trace (' + lineCount + ' lines)');
    };

    var showLines = function (lines) {
        var searchExpr = g_searchRegex ? g_searchText : escapeRegExp(g_searchText);
        var searchRegexp = new RegExp('(' + searchExpr + ')', g_searchMatchCase ? 'g' : 'gi');

        var entries = groupEntries(lines);
        var entriesEl = [];
        for (var i = 0; i < entries.length; i++) {
            entries[i].hidden = isEntryHidden(entries[i]);
            if (!entries[i].hidden) {
                entriesEl.push(buildEntryEl(entries[i], searchRegexp));
            }
        }
        g_lastEntries = entries;
        $lbScreen.empty().append(entriesEl);
    };

    var onLevelFilterChange = function () {
        g_infoHide = $('#infoHideChk').is(':checked');
        g_infoMinimize = $('#infoMinimizeChk').is(':checked');
        g_warnHide = $('#warnHideChk').is(':checked');
        g_warnMinimize = $('#warnMinimizeChk').is(':checked');
        g_errorHide = $('#errorHideChk').is(':checked');
        g_errorMinimize = $('#errorMinimizeChk').is(':checked');
        saveLevelFilterSettings();
        showLines(g_currentLines);
    };

    var onOriginSkipInputChange = function () {
        g_originSkipPrefixes = $(this).val().split(',')
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0; });
        saveOriginSkipPrefixes(g_originSkipPrefixes);
        showLines(g_currentLines);
    };

    var loadLevelFilterSettings = function () {
        try {
            var stored = JSON.parse(localStorage.getItem('lb-level-filters'));
            if (stored) {
                g_infoHide = !!stored.infoHide;
                g_infoMinimize = !!stored.infoMinimize;
                g_warnHide = !!stored.warnHide;
                g_warnMinimize = !!stored.warnMinimize;
                g_errorHide = !!stored.errorHide;
                g_errorMinimize = !!stored.errorMinimize;
            }
        } catch (e) {
            // localStorage unavailable or corrupt - keep defaults
        }
    };

    var saveLevelFilterSettings = function () {
        try {
            localStorage.setItem('lb-level-filters', JSON.stringify({
                infoHide: g_infoHide, infoMinimize: g_infoMinimize,
                warnHide: g_warnHide, warnMinimize: g_warnMinimize,
                errorHide: g_errorHide, errorMinimize: g_errorMinimize
            }));
        } catch (e) {
            // non-critical
        }
    };

    function loadOriginSkipPrefixes() {
        try {
            var stored = localStorage.getItem('lb-origin-skip-prefixes');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            // localStorage unavailable or corrupt - fall back to default
        }
        return DEFAULT_ORIGIN_SKIP_PREFIXES.slice();
    }

    var saveOriginSkipPrefixes = function (prefixes) {
        try {
            localStorage.setItem('lb-origin-skip-prefixes', JSON.stringify(prefixes));
        } catch (e) {
            // non-critical
        }
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

    // g_lastEntries may group several raw lines into one rendered row (folded stack
    // trace) or skip some entirely (level hidden), so a rendered DOM row no longer
    // corresponds 1:1 to a g_currentLines item - map back via the entry's raw-line
    // index range instead of assuming one row = one line.
    var getVisibleEntries = function () {
        var visible = [];
        for (var i = 0; i < g_lastEntries.length; i++) {
            if (!g_lastEntries[i].hidden) {
                visible.push(g_lastEntries[i]);
            }
        }
        return visible;
    };

    var removeOverflownRows = function () {
        var rows = $lbScreen.children(), r, l = rows.length, row;
        if (l <= 1) {
            return;
        }
        var visibleEntries = getVisibleEntries();
        var clientHeight = window.innerHeight || document.documentElement.clientHeight;
        var clientWidth = window.innerWidth || document.documentElement.clientWidth;
        var cutoffEntry = null;
        for (r = l - 1; r >= 0; r--) {
            row = rows[r];
            var rect = row.getBoundingClientRect();
            var isRowVisible = rect.bottom <= clientHeight && rect.right <= clientWidth;
            if (isRowVisible) {
                break;
            }
            cutoffEntry = visibleEntries[r];
        }
        if (cutoffEntry) {
            g_currentLines.length = cutoffEntry.startIdx;
        }
    };

    var removeTopOverflownRows = function () {
        var rows = $lbScreen.children(), r, l = rows.length, row;
        if (l <= 1) {
            return;
        }
        var visibleEntries = getVisibleEntries();

        var lineCount = 0;
        for (r = l - 1; r >= 0; r--) {
            row = rows[r];
            var rect = row.getBoundingClientRect();
            lineCount += Math.ceil(rect.height / g_lineHeightPx);
            if (lineCount > g_linesHeight) {
                break;
            }
        }

        if (r >= 0) {
            var cutoffEndIdx = visibleEntries[r].endIdx;
            for (var k = r; k >= 0; k--) {
                rows[k].remove();
            }
            g_currentLines.splice(0, cutoffEndIdx + 1);
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
