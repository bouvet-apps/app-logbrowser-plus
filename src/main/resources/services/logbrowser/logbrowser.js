var logFileLib = require('/lib/logfile');
var webSocketLib = require('/lib/xp/websocket');
var Files = Java.type('java.nio.file.Files');
var Paths = Java.type('java.nio.file.Paths');
var StandardCharsets = Java.type('java.nio.charset.StandardCharsets');

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

    if (req.params.action === 'download') {
        return downloadLogFile();
    }

    return {
        status: 204
    };
};

var downloadLogFile = function () {
    var logPath = logFileLib.getLogPath();
    var path = Paths.get(logPath);

    if (!Files.exists(path)) {
        return {
            status: 404,
            contentType: 'text/plain; charset=UTF-8',
            body: 'Log file not found.'
        };
    }

    var now = new Date();
    var timestamp = now.getFullYear().toString() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) + '-' +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds());

    try {
        var content = new java.lang.String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        return {
            contentType: 'text/plain; charset=UTF-8',
            headers: {
                'Content-Disposition': 'attachment; filename="server-' + timestamp + '.log.txt"'
            },
            body: content
        };
    } catch (e2) {
        return {
            status: 500,
            contentType: 'text/plain; charset=UTF-8',
            body: 'Unable to read log file.'
        }
    }

};

var pad = function (value) {
    return value < 10 ? '0' + value : String(value);
}

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
