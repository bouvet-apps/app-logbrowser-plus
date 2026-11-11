package com.bouvet.app.logbrowser2;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;

import com.google.common.base.Supplier;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.joran.JoranConfigurator;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.Appender;
import ch.qos.logback.core.FileAppender;

import com.enonic.xp.home.HomeDir;

import static com.google.common.base.Suppliers.memoizeWithExpiration;

public final class LogHelper
{
    private final static Supplier<Path> LOG_PATH_CACHE = memoizeWithExpiration( LogHelper::findLogPath, 10, TimeUnit.MINUTES );

    public static Path getLogPath()
    {
        return LOG_PATH_CACHE.get();
    }

    private static Path findLogPath()
    {
        final File logbackConfig = getLogbackConfig();
        if ( logbackConfig.exists() )
        {
            final Path logPath = getLogFromLogback( logbackConfig );
            if ( logPath != null )
            {
                return logPath;
            }
        }

        final File xpHome = HomeDir.get().toFile();
        return Paths.get( xpHome.getAbsolutePath(), "logs", "server.log" );

    }

    private static Path getLogFromLogback( final File logbackConfig )
    {
        try
        {
            LoggerContext loggerContext = new LoggerContext();
            JoranConfigurator jc = new JoranConfigurator();
            jc.setContext( loggerContext );
            loggerContext.reset();
            jc.doConfigure( logbackConfig );

            for ( Logger logger : loggerContext.getLoggerList() )
            {
                for ( Iterator<Appender<ILoggingEvent>> index = logger.iteratorForAppenders(); index.hasNext(); )
                {
                    Appender<ILoggingEvent> appender = index.next();
                    if ( appender instanceof FileAppender )
                    {
                        return Paths.get( ( (FileAppender) appender ).getFile() );
                    }
                }
            }
            return null;
        }
        catch ( Exception e )
        {
            return null;
        }
    }

    private static File getLogbackConfig()
    {
        final File xpHome = HomeDir.get().toFile();
        return Paths.get( xpHome.getAbsolutePath(), "config", "logback.xml" ).toFile();
    }
}
