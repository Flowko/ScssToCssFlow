import * as vscode from "vscode";

import { StatusBarUi } from "./statubarUi";

const path = require("path");
const scss = require("sass");

const fs = require("iofs");
const postcss = require("postcss");
const autoprefixer = require("autoprefixer");
const std = vscode.window.createOutputChannel("vswebcompilerflow") as any;

let prefixer: any;
let options: any = {
  compileOnSave: true,
  autoPrefixer: true,
  indentType: 'space',
  indentWidth: 2,
  output: 'expanded | compressed' as any,
  exclude: '' as any
};

const compiler = {
  compile(doc: any) {
    let origin = doc.fileName || "";
    let target = origin.replace(/\.scss$/, "");
    let task = [];

    if (origin === target) {
      return;
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

      return { style, output: target + ext };
    });

    if (task.length === 1) {
      task[0].output = target + ".css";
    }

    task = task.map((item: any) => {
      return compileScss(item.style, origin, item.output);
    });

    StatusBarUi.compiling();

    Promise.all(task)
      .then((list) => {
        list.forEach((it) => {
          fs.echo(it.css, it.output);
        });
        StatusBarUi.compilationSuccess();
      })
      .catch((err) => {
        vscode.window.showInformationMessage(err);
        StatusBarUi.compilationError();
      });


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
  vscode.workspace.onDidChangeConfiguration(init);

  vscode.workspace.onDidSaveTextDocument((doc) => {
    std.clear();
    compiler.filter(doc);
  });

  let cmd = vscode.commands.registerCommand('vswebcompilerflow.compile', _ => {
    let editor = vscode.window.activeTextEditor;

    if (editor) {
      compiler.compile(editor.document);
    }
  });

  context.subscriptions.push(cmd);
}

function init() {
  let conf = vscode.workspace.getConfiguration('vswebcompilerflow') as any;
  let folders = vscode.workspace.workspaceFolders;
  let wsDir = '';
  let configFile = '';

  StatusBarUi.init();

  Object.assign(options, conf);
  conf = null;

  options.output = options.output.split('|').map((it: any) => it.trim());

  if (folders && folders.length) {
    wsDir = folders[0].uri.path;
  }

  if (wsDir) {
    configFile = path.join(wsDir, '.scssrc');
  } else {
    let editor = vscode.window.activeTextEditor;
    if (editor) {
      wsDir = path.dirname(editor.document.fileName);
      configFile = path.join(wsDir, '.scssrc');
    }
  }

  options.workspace = wsDir;

  if (fs.exists(configFile)) {
    let tmp = JSON.parse(fs.cat(configFile).toString());

    Object.assign(options, tmp);
    tmp = null;

    if (options.outdir) {
      options.outdir = path.join(options.workspace, options.outdir);
    }
  }

  if (options.exclude) {
    options.exclude = new RegExp(options.exclude, 'i');
  }

  prefixer = postcss().use(
    autoprefixer({
      browsers: options.browsers
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
        indentWidth: options.indentWidth
      }).css + ''
    ).trim();
  } catch (err) {
    std.out(err);
    std.show(true);
    // console.error(err)
  }
}

const compileScss = (style: any, entry: any, output: any) => {
  if (options.outdir) {
    let tmp = output.replace(options.workspace, '.');
    output = path.join(options.outdir, tmp);
  }

  let css = render(style, entry);

  if (options.autoPrefixer) {
    return prefixer.process(css, { from: '', to: '' }).then((result: any) => {
      return { css: result.css, output };
    });
  } else {
    return Promise.resolve({ css, output });
  }
};

export function deactivate() { }
