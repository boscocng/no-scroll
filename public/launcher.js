const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
const fromInstallPage = document.referrer === new URL("/", location.href).href;

if (standalone) {
  document.getElementById("standalone").hidden = false;
} else if (fromInstallPage) {
  document.getElementById("add").hidden = false;
} else {
  location.replace(document.body.dataset.target);
}
