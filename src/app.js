import queryString from "query-string";
import { SimpleDropzone } from "simple-dropzone";
import WebGL from "three/examples/jsm/capabilities/WebGL.js";
import { objs } from "./objects.js";
import { Viewer } from "./viewer.js";

window.VIEWER = {};

if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
  console.error("The File APIs are not fully supported in this browser.");
} else if (!WebGL.isWebGLAvailable()) {
  console.error("WebGL is not supported in this browser.");
}

class App {
  /**
   * @param  {Element} el
   * @param  {Location} location
   */
  constructor(el, location) {
    const hash = location.hash ? queryString.parse(location.hash) : {};
    this.options = {
      kiosk: Boolean(hash.kiosk),
      model: hash.model || "",
      preset: hash.preset || "",
      cameraPosition: hash.cameraPosition
        ? hash.cameraPosition.split(",").map(Number)
        : null,
    };

    this.el = el;
    this.viewer = null;
    this.viewer_second = null;
    this.viewerEl = null;
    this.viewerEl_second = null;
    this.timer = null;
    this.files = { fileMap: {}, paths: [], index: 0 };
    this.spinnerEl = el.querySelector(".spinner");
    this.dropEl = el.querySelector(".dropzone");
    this.inputEl = el.querySelector("#file-input");
    // this.validator = new Validator(el);

    this.viewMultiple = false;

    this.createDropzone();
    this.hideSpinner();

    const options = this.options;

    if (options.kiosk) {
      const headerEl = document.querySelector("header");
      headerEl.style.display = "none";
    }

    if (options.model) {
      this.view(options.model, "", new Map());
    }
  }

  /**
   * Sets up the drag-and-drop controller.
   */
  createDropzone() {
    const dropCtrl = new SimpleDropzone(this.dropEl, this.inputEl);
    dropCtrl.on("drop", ({ files }) => this.load(files));
    // dropCtrl.on('dropstart', () => this.showSpinner());
    // dropCtrl.on('droperror', () => this.hideSpinner());
  }

  /**
   * Sets up the view manager.
   * @return {Viewer}
   */
  createViewer() {
    this.viewerEl = document.createElement("div");
    this.viewerEl.classList.add("viewer");

    this.dropEl.innerHTML = "";
    this.dropEl.appendChild(this.viewerEl);
    this.viewer = new Viewer(this.viewerEl, this.options);

    const overlays = [
      {
        className: "top-overlay",
        clickHandler: () => {
          window.location.reload();
        },
      },
      {
        className: "left-overlay",
        clickHandler: () => this.prevModel(),
      },
      {
        className: "right-overlay",
        clickHandler: () => this.nextModel(),
      },
    ];

    if (!this.viewMultiple) {
      overlays.forEach((overlay) => {
        const div = document.createElement("div");
        div.classList.add(overlay.className);
        div.addEventListener("click", overlay.clickHandler);
        div.addEventListener("mouseover", () => {
          div.style.backgroundColor = "rgba(0, 0, 0, 0)";
        });
        div.addEventListener("mouseout", () => {
          div.style.backgroundColor = "rgba(0, 0, 0, 0)";
        });
        this.viewerEl.appendChild(div);
      });
    }

    return this.viewer;
  }

  /**
   * Sets up the view manager.
   * @return {Viewer}
   */
  createViewerForMultiple() {
    const viewerEl = document.createElement("div");
    viewerEl.classList.add("viewer");

    this.dropEl.appendChild(viewerEl);
    const viewer = new Viewer(viewerEl, this.options);

    return viewer;
  }

  /**
   * Loads the current model.
   */
  loadCurrentModel(currentIndex = null) {
    if (this.files.paths.length === 0) {
      this.onError("No .gltf or .glb asset found.");
    }
    let paths = this.files.paths[currentIndex ?? this.files.index];
    if (this.viewMultiple) {
      this.viewMultipleModels(this.files);
    } else {
      this.view(paths.rootFile, paths.rootPath, this.files.fileMap);
    }
  }

  /**
   * Loads the next model in the fileset.
   */
  nextModel() {
    this.files.index++;
    if (this.files.index >= this.files.paths.length) {
      this.files.index = 0;
    }
    this.loadCurrentModel();
  }

  /**
   * Loads the previous model in the fileset.
   */
  prevModel() {
    this.files.index--;
    if (this.files.index < 0) {
      this.files.index = this.files.paths.length - 1;
    }
    this.loadCurrentModel();
  }

  /**
   * Loads a fileset provided by user action.
   * @param  {Map<string, File>} fileMap
   */
  load(fileMap) {
    this.files.fileMap = fileMap;
    Array.from(fileMap).forEach(([path, file]) => {
      if (file.name.match(/\.(gltf|glb)$/)) {
        this.files.paths.push({
          rootFile: file,
          rootPath: path.replace(file.name, ""),
        });
      }
    });

    this.loadCurrentModel();
  }

  uploadCustom() {
    this.inputEl.click();
    this.dropEl.childNodes[1].style.display = "none";
    this.dropEl.childNodes[3].style.display = "none";
    this.dropEl.childNodes[7].style.display = "none";
  }

  /**
   * Loads a fileset provided by external source.
   * @param  {Array<{filename: string, link: string}>} objs
   */
  loadExternal(objs) {
    let modelObjs = [];
    if (objs.viewMultiple) {
      this.viewMultiple = true;
      modelObjs = [...objs.objs];
    } else {
      modelObjs = [...objs];
    }
    this.showSpinner();
    this.dropEl.replaceChildren();

    if (this.viewMultiple) {
      const max_rows = Math.floor(Math.sqrt(modelObjs.length));
      const max_columns = Math.ceil(modelObjs.length / max_rows);
      this.dropEl.classList = "dropzone_layout";
      this.dropEl.style.gridTemplateColumns = `repeat(${max_columns}, minmax(0, 1fr))`;
      this.dropEl.style.gridTemplateRows = `repeat(${max_rows}, minmax(0, 1fr))`;
    }

    Promise.all(
      modelObjs.map((fileObj) => {
        return fetch(fileObj.link)
          .then((res) => res.blob())
          .then((blob) => {
            return new File([blob], fileObj.filename, { type: "" });
          });
      })
    ).then((fileList) => {
      const fileMap = new Map(fileList.map((file) => [file.name, file]));
      this.load(fileMap);
    });
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  loadAllShuffle(objs) {
    let modelObjs = [];
    modelObjs = [...objs];
    this.showSpinner();
    this.dropEl.replaceChildren();

    Promise.all(
      modelObjs.map((fileObj) => {
        return fetch(fileObj.link)
          .then((res) => res.blob())
          .then((blob) => {
            return new File([blob], fileObj.filename, { type: "" });
          });
      })
    ).then((fileList) => {
      fileList = this.shuffleArray(fileList);
      const fileMap = new Map(fileList.map((file) => [file.name, file]));
      this.load(fileMap);
      setInterval(() => {
        this.nextModel();
      }, 10000);
    });
  }

  /**
   * Passes a model to the viewer, given file and resources.
   * @param  {File|string} rootFile
   * @param  {string} rootPath
   * @param  {Map<string, File>} fileMap
   */
  view(rootFile, rootPath, fileMap) {
    if (this.viewer) this.viewer.clear();

    const viewer = this.viewer || this.createViewer();

    const fileURL =
      typeof rootFile === "string" ? rootFile : URL.createObjectURL(rootFile);

    const cleanup = () => {
      this.hideSpinner();
      if (typeof rootFile === "object") URL.revokeObjectURL(fileURL);
    };

    viewer
      .load(fileURL, rootPath, fileMap)
      .catch((e) => this.onError(e))
      .then((gltf) => {
        cleanup();
      });

    this.addKeyDownEvent();
  }

  async viewMultipleModels(files) {
    this.dropEl.innerHTML = "";

    const fileMap = files.fileMap;
    const gltfPromises = [];
    files.paths.forEach((path) => {
      const fileUrl = URL.createObjectURL(path.rootFile);
      const viewer = this.createViewerForMultiple();
      gltfPromises.push(viewer.load(fileUrl, path.rootPath, fileMap));
    });

    await Promise.all(gltfPromises);
    this.hideSpinner();
  }

  /**
   * @param  {Error} error
   */
  onError(error) {
    let message = (error || {}).message || error.toString();
    if (message.match(/ProgressEvent/)) {
      message =
        "Unable to retrieve this file. Check JS console and browser network tab.";
    } else if (message.match(/Unexpected token/)) {
      message = `Unable to parse file content. Verify that this file is valid. Error: "${message}"`;
    } else if (error && error.target && error.target instanceof Image) {
      message = "Missing texture: " + error.target.src.split("/").pop();
    }
    window.alert(message);
    console.error(error);
  }

  showSpinner() {
    this.spinnerEl.style.display = "";
  }

  hideSpinner() {
    this.spinnerEl.style.display = "none";
  }

  addKeyDownEvent() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "r") {
        if (this.viewer) this.viewer.resumeRotate();
        if (this.viewer_second) this.viewer_second.resumeRotate();
      } else if (e.key === "s") {
        if (this.viewer) this.viewer.stopRotate();
        if (this.viewer_second) this.viewer_second.stopRotate();
      }
    });
  }
}

// document.body.innerHTML += Footer();

document.addEventListener("DOMContentLoaded", () => {
  const app = new App(document.body, location);

  window.VIEWER.app = app;

  // Add event listeners for examples button
  document.querySelector(".examples button").addEventListener("click", () => {
    app.loadExternal(objs);
  });

  // setup page event handlers
  document.addEventListener("keypress", (e) => {
    if (e.key === "f") {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        // app.viewerEl.requestFullscreen();
      }
    } else if (e.key === "o" && !app.viewer) {
      app.inputEl.click();
    } else if (e.key === "h" && !app.viewer) {
      let details = document.querySelector(".hotkeys").querySelector("details");
      details.open = !details.open;
    } else if (e.key === "e") {
      app.loadExternal(objs);
    }
  });

  // setup navigation event handlers
  document.addEventListener("keydown", (e) => {
    if (!app.viewer) return;
    console.log(e.key);
    if (
      e.key === "ArrowRight" ||
      e.key === "n" ||
      e.key === "3" ||
      e.key == "PageUp"
    ) {
      app.nextModel();
    } else if (
      e.key === "ArrowLeft" ||
      e.key === "b" ||
      e.key === "6" ||
      e.key == "PageDown"
    ) {
      app.prevModel();
    } else if (e.key === "ArrowUp") {
      window.location.reload();
    }
  });

  console.info("[glTF Viewer] Debugging data exported as `window.VIEWER`.");
});
