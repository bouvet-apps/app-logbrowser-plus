package com.bouvet.app.logbrowserplus;

public final class LogLine
{
    final String value;

    final long start;

    final long end;

    public LogLine( final String value, final long start, final long end )
    {
        this.value = value;
        this.start = start;
        this.end = end;
    }
}
