package com.bouvet.app.logbrowser2;

import java.nio.file.Files;

import com.enonic.xp.testing.ScriptRunnerSupport;

public class LogFileScriptTest
    extends ScriptRunnerSupport
{
    @Override
    protected void initialize()
        throws Exception
    {
        super.initialize();
        System.setProperty( "xp.home", Files.createTempDirectory( "logbrowser-test-home" ).toString() );
    }

    @Override
    public String getScriptTestFile()
    {
        return "/lib/logfile-test.js";
    }
}
