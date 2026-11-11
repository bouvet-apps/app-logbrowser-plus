# Log Browser 2 admin tool for Enonic XP

<img align="right" alt="Log Browser 2 Logo" src="src/main/resources/assets/img/logbrowser.svg" width="128">

This app allows remote browsing of the XP log file.

This is a Bouvet-maintained fork of Enonic's [app-logbrowser](https://github.com/enonic/app-logbrowser)
(Apache License 2.0), targeting **Enonic XP 8 only**, with a more readable log view
(folding of multiline stack traces, filtering by log level).

Not to be confused with Bouvet's other fork,
[app-logbrowser-plus](https://github.com/bouvet-apps/app-logbrowser-plus) ("Log Browser
Plus"), which targets XP 7 and was built independently. Both apps started from a similar
idea; they are separate codebases with different `appId`s and can be installed side by
side.

## Features

- View and navigate XP log file remotely from the browser
- Search for text in the log
- Search using regular expressions or case sensitive match
- Highlighting of search text

## Keyboard shortcuts

The following keyboard shortcuts are available in the app:

| Keyboard Shortcut | Description |
| ----------- | ------------------- |
| <kbd>↓</kbd> | Navigate forward one line |
| <kbd>↑</kbd> | Navigate backward one line |
| <kbd>Page Down</kbd> | Navigate forward one page |
| <kbd>Page Up</kbd> | Navigate backward one page |
| <kbd>Home</kbd> | Navigate to the beginning of the file |
| <kbd>End</kbd> | Navigate to the end of the file |
| <kbd>shift</kbd>+<kbd>F</kbd> | Scroll Forward, aka "tail -f" |
| <kbd>ctrl</kbd>+<kbd>F</kbd> or <kbd>cmd</kbd>+<kbd>F</kbd> | Open the Search/Find dialog |
| <kbd>esc</kbd> | Stop scroll Forward mode, or close Search dialog |

In addition the mouse wheel can be used for navigating up and down the file. 

## Notes

- A user needs to have the `system.admin` _role_ to get access to this tool.
- The _Forward_ mode (aka "tail -f") uses WebSocket connections. If there is a front-end server or proxy blocking WebSocket connections, it won't work.

## Releases and Compatibility

This fork targets **Enonic XP 8** only. See `gradle.properties` for the exact `xpVersion`.


## Building and deploying

Build this application from the command line. Go to the root of the project and enter:

    ./gradlew clean build

To deploy the app, set `$XP_HOME` environment variable and enter:

    ./gradlew deploy

