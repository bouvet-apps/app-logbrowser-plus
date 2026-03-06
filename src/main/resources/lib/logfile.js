var logTailManager = __.newBean('com.enonic.app.logbrowser.LogTailManager');

exports.getLines = function (params) {
    var bean = __.newBean('com.enonic.app.logbrowser.LogFileHandler');
    bean.lineCount = params.lineCount;
    bean.from = params.from;
    bean.action = params.action || 'forward';
    bean.search = params.search;
    bean.regex = params.regex;
    bean.matchCase = params.matchCase;

    return __.toNativeObject(bean.getLines());
};

exports.getLogPath = function () {
    var bean = __.newBean('com.enonic.app.logbrowser.LogFileHandler');
    return bean.getLogPath();
};

exports.getStats = function () {
    var bean = __.newBean('com.enonic.app.logbrowser.LogFileHandler');
    return __.toNativeObject(bean.getStats());
};

exports.newLogListener = function (id, initialPos, lineCount, onNewLogLines) {
    var callback = function (newLines) {
        onNewLogLines(__.toNativeObject(newLines));
    };
    return logTailManager.newLogTailHandler(id, initialPos, lineCount, callback);
};

exports.cancelLogListener = function (id) {
    return logTailManager.remove(id);
};