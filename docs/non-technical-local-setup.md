# Local Setup Guide (Non-Technical)

This guide helps you run TRADER on your own computer.

## What You Need

- A Mac or Linux computer
- Internet connection
- Terminal app
- Node.js 20+ and npm

If you do not already have Node.js, install it from: <https://nodejs.org/>

## 1. Get the Project

Option A (recommended, with updates):

```bash
git clone https://github.com/morirewbc/TRADER_ng.git
cd TRADER_ng
```

Option B (ZIP download):

1. Download ZIP from GitHub
2. Unzip it
3. Open Terminal inside that folder

## 2. Make Scripts Executable

Run once:

```bash
chmod +x tools/local/*.sh
```

## 3. Install

```bash
./tools/local/install.sh
```

This installs dependencies and checks that your machine is ready.

## 4. Start the App

```bash
./tools/local/start.sh
```

Your browser should open automatically. If not, open:

- <http://localhost:3000/chat>

If port 3000 is busy, the app may use another port.

## 5. Stop the App

If `start.sh` is running in the current terminal, press `Ctrl + C`.

Or stop from another terminal window:

```bash
./tools/local/stop.sh
```

## 6. Update to Latest Version

If you cloned with git:

```bash
./tools/local/update.sh
```

If you used a ZIP download, download a new ZIP instead.

## 7. Uninstall (Remove from Computer)

```bash
./tools/local/uninstall.sh
```

Type `UNINSTALL` when asked.

## Quick Command List

```bash
./tools/local/install.sh
./tools/local/start.sh
./tools/local/stop.sh
./tools/local/update.sh
./tools/local/uninstall.sh
```

## If Something Goes Wrong

- Run install again: `./tools/local/install.sh`
- Run health check directly: `npm run doctor`
- Make sure Node.js is version 20 or newer: `node -v`
