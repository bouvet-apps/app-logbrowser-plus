package com.bouvet.app.logbrowserplus;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public final class LogTailHandler
{
    private final String id;

    private final long initialPosition;

    private final long lineCount;

    private final Consumer<LogLinesMapper> onNewLines;

    private final CountDownLatch stopSignal;

    public LogTailHandler( final String id, final long initialPosition, final long lineCount, final Consumer<LogLinesMapper> onNewLines )
    {
        this.id = id;
        this.initialPosition = initialPosition;
        this.lineCount = lineCount;
        this.onNewLines = onNewLines;
        this.stopSignal = new CountDownLatch( 1 );
    }

    public void start()
    {
        startWatching();
    }

    public void stop()
    {
        System.out.println( "Stopping listener" );
        stopSignal.countDown();
    }

    private void startWatching()
    {
        ExecutorService service = Executors.newSingleThreadExecutor();
        service.submit( this::watchLogFile );
    }

    private Boolean watchLogFile()
        throws IOException, InterruptedException
    {
        final Path logPath = LogHelper.getLogPath();
        while ( !Files.exists( logPath ) )
        {
            if ( stopSignal.await( 500, TimeUnit.MILLISECONDS ) )
            {
                System.out.println( "Stopped listener" );
                return false;
            }
        }

        try (final RandomAccessFile raf = new RandomAccessFile( logPath.toFile(), "r" ))
        {
            long currentPosition = initialPosition;
            while ( true )
            {
                if ( stopSignal.await( 200, TimeUnit.MILLISECONDS ) )
                {
                    System.out.println( "Stopped listener" );
                    return false;
                }
                final long currentLength = raf.length();
                if ( currentLength != currentPosition )
                {
                    sendNextLines();
                    currentPosition = currentLength;
                }
            }
        }
    }

    private void sendNextLines()
    {
        final LogFileHandler logFileHandler = new LogFileHandler();
        logFileHandler.setAction( "end" );
        logFileHandler.setFrom( 0L );
        logFileHandler.setLineCount( lineCount );

        try
        {
            this.onNewLines.accept( logFileHandler.getLines() );
        }
        catch ( IOException e )
        {
            e.printStackTrace();
        }
    }
}
