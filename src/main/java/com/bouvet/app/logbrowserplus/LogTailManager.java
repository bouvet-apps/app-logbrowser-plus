package com.bouvet.app.logbrowserplus;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Consumer;

public final class LogTailManager
{
    private final ConcurrentMap<String, LogTailHandler> logTailHandlers;

    public LogTailManager()
    {
        this.logTailHandlers = new ConcurrentHashMap<>();
    }

    public LogTailHandler newLogTailHandler( final String id, final long initialPos,final long lineCount, final Consumer<LogLinesMapper> onNewLines )
        throws IOException
    {
        final LogTailHandler tailHandler =
            logTailHandlers.computeIfAbsent( id, ( newId ) -> new LogTailHandler( id, initialPos, lineCount,onNewLines ) );
        tailHandler.start();
        return tailHandler;
    }

    public void remove( final String id )
        throws IOException
    {
        final LogTailHandler tailHandler = logTailHandlers.remove( id );
        tailHandler.stop();
    }

}
