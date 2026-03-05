package com.enonic.app.logbrowser;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import com.enonic.xp.script.bean.BeanContext;
import com.enonic.xp.script.bean.ScriptBean;

public class LogFileHandler
    implements ScriptBean
{
    private static int CR = 0xD;

    private static int LF = 0xA;

    private Long lineCount;

    private Long from;

    private String action;

    private String search;

    private Boolean regex = false;

    private Boolean matchCase = false;


    public void setLineCount( final Long lineCount )
    {
        this.lineCount = lineCount;
    }

    public void setFrom( final Long from )
    {
        this.from = from;
    }

    public void setAction( final String action )
    {
        this.action = action;
    }

    public void setSearch( final String search )
    {
        this.search = search;
    }

    public void setRegex( final Boolean regex )
    {
        this.regex = regex == null ? this.regex : regex;
    }

    public void setMatchCase( final Boolean matchCase )
    {
        this.matchCase = matchCase == null ? this.matchCase : matchCase;
    }

    public LogLinesMapper getLines()
        throws IOException
    {
        return new LogLinesMapper( readLog() );
    }

    public String getLogPath()
    {
        return LogHelper.getLogPath().toString();
    }

    private LogContext readLog()
        throws IOException
    {
        final Path logPath = LogHelper.getLogPath();
        if ( !Files.exists( logPath ) )
        {
            return new LogContext( 0 );
        }

        try (final RandomAccessFile raf = new RandomAccessFile( logPath.toFile(), "r" ))
        {
            final List<LogLine> lines = readLines( raf, this.action, this.lineCount, this.from );
            final long size = raf.length();
            return new LogContext( lines, size );
        }
    }

    private List<LogLine> readLines( final RandomAccessFile raf, final String action, final long lineCount, final long from )
        throws IOException
    {
        if ( "searchForward".equals( action ) )
        {
            final long searchMatchPos = findText( raf, from, this.search, ReadDirection.FORWARDS );
            if ( searchMatchPos == -1 )
            {
                return Collections.emptyList();
            }
            final List<LogLine> lines = readLines( raf, lineCount, searchMatchPos, ReadDirection.FORWARDS );
            return lines;
        }
        if ( "searchBackward".equals( action ) )
        {
            final long searchMatchPos = findText( raf, from, this.search, ReadDirection.BACKWARDS );
            if ( searchMatchPos == -1 )
            {
                return Collections.emptyList();
            }
            final List<LogLine> lines = readLines( raf, lineCount, searchMatchPos, ReadDirection.FORWARDS );
            return lines;
        }
        else if ( "forward".equals( action ) )
        {
            final List<LogLine> lines = readLines( raf, lineCount, from, ReadDirection.FORWARDS );
            if ( !lines.isEmpty() )
            {
                return lines;
            }
            return readLines( raf, "end", 1, 0 );
        }
        else if ( "backward".equals( action ) )
        {
            final List<LogLine> logLines = readLines( raf, lineCount, from, ReadDirection.BACKWARDS );
            if ( logLines.size() > 0 && logLines.size() < lineCount )
            {
                final List<LogLine> nextLines =
                    readLines( raf, lineCount - logLines.size(), logLines.get( logLines.size() - 1 ).end + 2, ReadDirection.FORWARDS );
                logLines.addAll( nextLines );
            }
            return logLines;
        }
        else if ( "end".equals( action ) )
        {
            return readLines( raf, lineCount, raf.length() - 1, ReadDirection.BACKWARDS );
        }
        else if ( "seek".equals( action ) )
        {
            final long lineStart;
            if ( from == 0 )
            {
                return readLines( raf, lineCount, from, ReadDirection.FORWARDS );
            }
            else if ( from == 1000 )
            {
                return readLines( raf, lineCount, raf.length() - 1, ReadDirection.BACKWARDS );
            }
            else
            {
                lineStart = findNextLineStart( raf, ( raf.length() / 1000 ) * from );
                return readLines( raf, lineCount, lineStart, ReadDirection.FORWARDS );
            }
        }
        else
        {
            return Collections.emptyList();
        }
    }

    private long findText( final RandomAccessFile file, long fromOffset, final String search, final ReadDirection direction )
        throws IOException
    {
        if ( search == null || search.length() == 0 )
        {
            return -1;
        }

        final long fileLength = file.length() - 1;
        ByteArrayOutputStream lineBytes = new ByteArrayOutputStream();

        final boolean forward = direction == ReadDirection.FORWARDS;
        if ( !forward && fromOffset <= 0 )
        {
            return -1;
        }
        if ( forward && fromOffset >= fileLength )
        {
            return -1;
        }

        fromOffset = fromOffset < 0 ? 0 : fromOffset;
        fromOffset = fromOffset > fileLength ? fileLength : fromOffset;

        long lineStart = fromOffset;
        final String searchText = matchCase ? search : search.toUpperCase();

        final Pattern regexPattern;
        try
        {
            regexPattern = regex ? Pattern.compile( search, matchCase ? 0 : Pattern.CASE_INSENSITIVE ) : null;
        }
        catch ( PatternSyntaxException e )
        {
            return -1;// Invalid regex pattern
        }

        for ( long filePointer = fromOffset; filePointer < fileLength && filePointer != -1; )
        {
            file.seek( filePointer );
            int readByte = file.readByte();

            if ( readByte == LF || readByte == CR )
            {
                if ( filePointer < fileLength )
                {
                    final String lineText = newString( lineBytes, !forward );
                    if ( regexPattern != null && regexPattern.matcher( lineText ).find() )
                    {
                        return forward ? lineStart : filePointer;
                    }
                    else
                    {
                        if ( !matchCase && lineText.toUpperCase().contains( searchText ) )
                        {
                            return forward ? lineStart : filePointer;
                        }
                        else if ( matchCase && lineText.contains( searchText ) )
                        {
                            return forward ? lineStart : filePointer;
                        }
                    }

                    lineBytes = new ByteArrayOutputStream();
                    lineStart = filePointer + 1;
                }
            }
            else
            {
                lineBytes.write( readByte );
            }

            if ( forward )
            {
                filePointer++;
            }
            else
            {
                filePointer--;
            }
        }

        if ( lineBytes.size() > 0 )
        {
            final String lineText = newString( lineBytes, !forward );
            if ( regexPattern != null && regexPattern.matcher( lineText ).find() )
            {
                return lineStart;
            }
            else
            {
                if ( !matchCase && lineText.toUpperCase().contains( searchText ) )
                {
                    return 0;
                }
                else if ( matchCase && lineText.contains( searchText ) )
                {
                    return 0;
                }
            }
        }
        return -1;
    }

    private List<LogLine> readLines( final RandomAccessFile file, final long maxLines, long fromOffset, final ReadDirection direction )
        throws IOException
    {
        final long fileLength = file.length() - 1;
        int lineCount = 0;

        ByteArrayOutputStream lineBytes = new ByteArrayOutputStream();

        long filePointer;
        final boolean forward = direction == ReadDirection.FORWARDS;

        if ( !forward && fromOffset <= 0 )
        {
            return Collections.emptyList();
        }
        if ( forward && fromOffset >= fileLength )
        {
            return Collections.emptyList();
        }

        fromOffset = fromOffset < 0 ? 0 : fromOffset;
        fromOffset = fromOffset > fileLength ? fileLength : fromOffset;

        // skip CR or CRLF before reading backwards
        if ( !forward )
        {
            int readByte = readByte( file, fromOffset );
            if ( readByte == CR )
            {
                fromOffset--;
            }
            else if ( readByte == LF )
            {
                fromOffset--;
                readByte = readByte( file, fromOffset );
                if ( readByte == CR )
                {
                    fromOffset--;
                }
            }
        }

        final List<LogLine> lines = new ArrayList<>();
        long lineStartOffset = fromOffset;
        for ( filePointer = fromOffset; filePointer < fileLength && filePointer != -1; )
        {
            file.seek( filePointer );
            int readByte = file.readByte();

            if ( readByte == LF || readByte == CR )
            {
                if ( filePointer < fileLength )
                {
                    final LogLine logLine;
                    if ( forward )
                    {
                        logLine = new LogLine( newString( lineBytes, false ), lineStartOffset, filePointer );
                        lineStartOffset = filePointer + 1;
                    }
                    else
                    {
                        logLine = new LogLine( newString( lineBytes, true ), filePointer + 1, lineStartOffset );
                        lineStartOffset = filePointer - 1;
                    }
                    lines.add( logLine );
                    lineBytes = new ByteArrayOutputStream();
                    lineCount = lineCount + 1;
                }
            }

            if ( lineCount >= maxLines )
            {
                break;
            }

            if ( readByte != LF && readByte != CR )
            {
                lineBytes.write( readByte );
            }

            if ( forward )
            {
                filePointer++;
            }
            else
            {
                filePointer--;
            }
        }

        if ( lineBytes.size() > 0 )
        {
            final String lastLine = newString( lineBytes, !forward );
            final LogLine logLine;
            if ( forward )
            {
                new LogLine( lastLine, lineStartOffset, filePointer );
                logLine = new LogLine( lastLine, lineStartOffset, Math.min( filePointer, fileLength ) );
            }
            else
            {
                logLine = new LogLine( lastLine, Math.max( filePointer, 0 ), lineStartOffset );
            }
            lines.add( logLine );
        }

        if ( direction == ReadDirection.BACKWARDS )
        {
            Collections.reverse( lines );
        }
        return lines;
    }

    private long findNextLineStart( final RandomAccessFile file, final Long from )
        throws IOException
    {
        final long fileLength = file.length() - 1;
        long filePointer;
        for ( filePointer = from; filePointer < fileLength && filePointer != -1; filePointer++ )
        {
            file.seek( filePointer );
            int readByte = file.readByte();
            if ( readByte == LF )
            {
                filePointer++;
                break;
            }
            if ( readByte == CR )
            {
                if ( readByte( file, filePointer + 1 ) == LF )
                {
                    filePointer++;
                }
                filePointer++;
                break;
            }
        }
        return filePointer;
    }

    private int readByte( final RandomAccessFile file, final long position )
    {
        try
        {
            file.seek( position );
            return file.readByte();
        }
        catch ( IOException e )
        {
            return -1;
        }
    }

    private String newString( final ByteArrayOutputStream bytes, final boolean reverse )
    {
        final byte[] byteArray = bytes.toByteArray();
        if ( reverse )
        {
            reverse( byteArray );
        }
        return new String( byteArray, StandardCharsets.UTF_8 );
    }

    private void reverse( final byte[] array )
    {
        int i = 0;
        int j = array.length - 1;
        byte tmp;
        while ( j > i )
        {
            tmp = array[j];
            array[j] = array[i];
            array[i] = tmp;
            j--;
            i++;
        }
    }

    @Override
    public void initialize( final BeanContext context )
    {

    }
}
