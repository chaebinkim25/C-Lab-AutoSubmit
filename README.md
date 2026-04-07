# C-Lab-AutoSubmit

## backend


```bash
apt update
apt install python3 python3-venv
python3 -m venv .venv
.venv/bin/pip install pydantic fastapi uvicorn
uvicorn main:app
```

## vscode extension frontend development

**install node.js, nvm**

```bash
sudo apt install nodejs
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts
npm install -g yo generator-code
yo code
```

- extension type: New Extension (TypeScript)
- extension name: c-lab-autosubmit
- extension identifier: (default value)
- extension description: Assist with C programming computer lab sessions by logging coding behavior and automating code submissions.
- git repo initialization: y
- bundler: webpack
- package manager: npm

**install npm dependencies**

```bash
 npm install --save-dev @types/node-fetch
```
