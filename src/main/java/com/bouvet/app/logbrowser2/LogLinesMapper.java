package com.bouvet.app.logbrowser2;

import java.util.List;

import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;

public final class LogLinesMapper
    implements MapSerializable
{
    private final List<LogLine> logLines;

    private final long size;

    public LogLinesMapper( final LogContext logContext )
    {
        this.logLines = logContext.logLines;
        this.size = logContext.size;
    }

    @Override
    public void serialize( final MapGenerator gen )
    {
        gen.value( "size", size );
        gen.array( "lines" );
        for ( LogLine logLine : logLines )
        {
            new LogLineMapper( logLine ).serialize( gen );
        }
        gen.end();
    }

}
