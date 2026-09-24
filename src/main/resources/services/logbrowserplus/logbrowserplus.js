var logFileLib = require('/lib/logfile');
var webSocketLib = require('/lib/xp/websocket');

// return current pos, line array, lineCount, eof: boolean
var handlePost = function (req) {
    var action = req.params.action;

    if (action === 'forward' || action === 'backward' || action === 'end' || action === 'seek' || action === 'searchForward' || action === 'searchBackward') {
        return getLines(req, action);
    }

    return {
        status: 400
    };
};

var getLines = function (req, action) {
    var from = req.params.from || '0';
    var lineCount = req.params.lineCount || '0';
    var searchText = req.params.search || '';
    var regex = req.params.regex === 'true';
    var matchCase = req.params.matchCase === 'true';
    action = action || 'forward';

    var linesResult = logFileLib.getLines({
        lineCount: lineCount,
        from: from,
        action: action,
        search: searchText,
        regex: regex,
        matchCase: matchCase
    });

    return {
        contentType: 'application/json',
        body: {
            success: true,
            lines: linesResult.lines,
            size: linesResult.size
        }
    };
};

var handleGet = function (req) {
    if (req.webSocket) {
        // log.info('Websocket connected');
        return {
            webSocket: {
                data: {},
                subProtocols: ["logbrowser"]
            }
        };
    }

    return {
        status: 204
    };
};

var handleWebSocket = function (event) {
    var sessionId = event.session.id;
    switch (event.type) {
    case 'open':
        // log.info('Websocket open: ' + sessionId);

        // first send last page
        var lineCount = event.session.params['lineCount'] || 10;
        var lastLinesResult = logFileLib.getLines({
            lineCount: lineCount,
            from: -1,
            action: 'end'
        });
        webSocketLib.send(sessionId, JSON.stringify(lastLinesResult));

        // start listening and sending new lines
        logFileLib.newLogListener(sessionId, lastLinesResult.size, lineCount, function (lines) {
            var msg = JSON.stringify(lines);
            webSocketLib.send(sessionId, msg);
        });
        break;

    case 'message':
        // log.info('Websocket message: ' + sessionId);
        break;

    case 'close':
        // log.info('Websocket close: ' + sessionId);
        logFileLib.cancelLogListener(sessionId);
        break;
    }
};

exports.get = handleGet;
exports.post = handlePost;
exports.webSocketEvent = handleWebSocket;
