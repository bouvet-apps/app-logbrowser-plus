var logTailManager = __.newBean('com.bouvet.app.logbrowser2.LogTailManager');

exports.getLines = function (params) {
    var bean = __.newBean('com.bouvet.app.logbrowser2.LogFileHandler');
    bean.setLineCount(__.nullOrValue(params.lineCount));
    bean.setFrom(__.nullOrValue(params.from));
    bean.setAction(params.action || 'forward');
    bean.setSearch(__.nullOrValue(params.search));
    bean.setRegex(__.nullOrValue(params.regex));
    bean.setMatchCase(__.nullOrValue(params.matchCase));

    return __.toNativeObject(bean.getLines());
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