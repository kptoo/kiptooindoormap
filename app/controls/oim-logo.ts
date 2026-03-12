import { ControlPosition, IControl } from "maplibre-gl";

export default class OIMLogo implements IControl {
  private container!: HTMLDivElement;

  getDefaultPosition(): ControlPosition {
    return "bottom-left";
  }

  onAdd(): HTMLElement {
    this.container = document.createElement("div");
    this.container.className = "mapboxgl-ctrl";
    this.container.style.pointerEvents = "auto";
    this.container.innerHTML = `
    <a 
      href="https://github.com/kptoo/kiptooindoormap" 
      target="_blank" 
      class="flex items-center space-x-1 p-2"
      aria-label="KiptooIndoorMaps">
    </a>
    `;
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }
}
