package com.bouvet.app.logbrowserplus;

import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;

public final class LogLineMapper
    implements MapSerializable
{
    private final LogLine logLine;

    public LogLineMapper( final LogLine logLine )
    {
        this.logLine = logLine;
    }

    @Override
    public void serialize( final MapGenerator gen )
    {
        gen.map();
        gen.value( "value", logLine.value );
        gen.value( "start", logLine.start );
        gen.value( "end", logLine.end );
        gen.end();
    }

}
