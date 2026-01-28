// src/trade-engine/EngineEvents.js
import EventEmitter from "events";

class EngineEvents extends EventEmitter {}

export const engineEvents = new EngineEvents();
