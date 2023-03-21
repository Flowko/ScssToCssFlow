import * as vscode from "vscode";

import { StatusBarUi } from "./statubarUi";

const path = require("path");
const scss = require("sass");

const iofs = require("iofs");
const fs = require("fs");
const postcss = require("postcss");
const autoprefixer = require("autoprefixer");
const { convertCssToScss } = require("./lib/sassParser");

//日志输出
let log = vscode.window.createOutputChannel("scss-to-css-flow", { log: true });
export function successlog(message: string) {
  log.show();
  log.appendLine(message);
}

export function warnlog(message: string, data: any = null) {
  log.show();
  data ? log.warn(message, data) : log.warn(message);
}

export function errorlog(message: string, data: any = null) {
  log.show();
  data ? log.error(message, data) : log.error(message);
}

let prefixer: any;
let options: any = {
  compileOnSave: true,
  autoPrefixer: false,
  indentType: "space",
  indentWidth: 2,
  output: "expanded | compressed" as any,
  outDir: "",
  exclude: "" as any,
  showButtons: true,
  browsers: [],
};

export function getRootPath(): string {
  return vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";
}

const compiler = {
  compile(doc: any) {
    let origin = doc.fileName || "";
    let task = [];
    if (!origin || ![".scss"].includes(path.extname(origin).toLowerCase())) {
      return;
    }

    let filename = path.basename(origin).split(".")[0];
    let target = path.dirname(origin);
    if (options.outDir) {
      if (path.isAbsolute(options.outDir)) {
        target = path.join(getRootPath(), options.outDir);
      } else {
        target = path.join(path.dirname(origin), options.outDir);
      }
    }

    if (!fs.existsSync(target)) {
      //recursive 递归创建目录
      fs.mkdirSync(target, { recursive: true });
    }

    task = options.output.map((style: any) => {
      let ext = ".css";
      switch (style) {
        case "compressed":
          ext = ".min" + ext;
          break;
        default:
          ext = ext;
      }
      return { style, output: path.join(target, filename + ext) };
    });

    if (task.length === 1) {
      task[0].output = path.join(target, filename + ".css");
    }

    task = task.map((item: any) => {
      return compileScss(item.style, origin, item.output);
    });

    Promise.all(task)
      .then((list) => {
        list.forEach((it) => {
          //输出文件
          iofs.echo(it.css, it.output);
          // fs.writeFileSync(it.output, JSON.stringify(it.css, null, '\t'), 'utf8')
          //刷新目录
          vscode.commands.executeCommand(
            "workbench.files.action.refreshFilesExplorer"
          );
        });
      })
      .catch((err) => {
        StatusBarUi.compilationError();
      });
  },
  cssToScss(doc: any) {
    let origin = doc.fileName || "";
    let target = origin.replace(/\.css$/, "");

    if (origin === target) {
      return;
    }

    let ext = ".scss";
    let filename = target + ext;
    const initialContents = fs.readFileSync(origin, "UTF8");
    const processedContents = convertCssToScss(initialContents);

    fs.writeFileSync(filename, processedContents);
    //刷新目录
    vscode.commands.executeCommand(
      "workbench.files.action.refreshFilesExplorer"
    );
  },
  filter(doc: any) {
    if (!options.compileOnSave) {
      return;
    }

    let origin = doc.fileName || "";

    if (/\/var\.scss$/.test(origin)) {
      return;
    }

    if (options.exclude) {
      if (options.exclude.test(origin)) {
        return;
      }
    }
    this.compile(doc);
  },
};

export function activate(context: vscode.ExtensionContext) {
  init();
  vscode.window.onDidChangeActiveTextEditor(init);
  vscode.workspace.onDidChangeConfiguration(init);

  vscode.workspace.onDidSaveTextDocument((doc) => {
    log.clear();
    compiler.filter(doc);
  });

  let compileCmd = vscode.commands.registerCommand(
    "scss-to-css-compile.compile",
    (_) => {
      let editor = vscode.window.activeTextEditor;
      if (editor) {
        compiler.compile(editor.document);
      }
    }
  );
  let cssToScssCmd = vscode.commands.registerCommand(
    "scss-to-css-compile.css-to-scss",
    (_) => {
      let editor = vscode.window.activeTextEditor;

      if (editor) {
        compiler.cssToScss(editor.document);
      }
    }
  );

  context.subscriptions.push(compileCmd, cssToScssCmd);
}

function init() {
  let conf = vscode.workspace.getConfiguration("scss-to-css-compile") as any;
  let folders = vscode.workspace.workspaceFolders;
  let wsDir = "";
  Object.assign(options, conf);
  conf = null;

  options.output = options.output.split("|").map((it: any) => it.trim());

  if (folders && folders.length) {
    wsDir = folders[0].uri.path;
  }

  options.workspace = wsDir;

  if (options.exclude) {
    options.exclude = new RegExp(options.exclude, "i");
  }

  let file = vscode.window.activeTextEditor?.document.uri.path || "";
  if (file && [".scss", ".css"].includes(path.extname(file).toLowerCase())) {
    if (options.showButtons) {
      StatusBarUi.init();
      StatusBarUi.show();
    }
  } else {
    StatusBarUi.hide();
  }

  prefixer = postcss().use(
    autoprefixer({
      overrideBrowserslist: options.browsers,
    })
  );
}

function render(style: any, file: any) {
  try {
    return (
      scss.renderSync({
        file,
        outputStyle: style,
        indentType: options.indentType,
        indentWidth: options.indentWidth,
      }).css + ""
    ).trim();
  } catch (err) {
    errorlog("编译错误", err);
  }
}

const compileScss = (style: any, entry: any, output: any) => {
  let css = render(style, entry);
  if (options.autoPrefixer) {
    return prefixer.process(css, { from: "", to: "" }).then((result: any) => {
      return { css: result.css, output };
    });
  } else {
    return Promise.resolve({ css, output });
  }
};

export function deactivate() {}
