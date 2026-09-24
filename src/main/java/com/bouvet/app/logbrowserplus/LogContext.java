package com.bouvet.app.logbrowserplus;

import java.util.Collections;
import java.util.List;

public final class LogContext
{
    final List<LogLine> logLines;

    final long size;

    public LogContext( final List<LogLine> logLines, final long size )
    {
        this.logLines = logLines;
        this.size = size;
    }

    public LogContext( final long size )
    {
        this.logLines = Collections.emptyList();
        this.size = size;
    }
}
