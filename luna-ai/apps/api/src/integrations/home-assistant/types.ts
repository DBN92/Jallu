export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    brightness?: number;
    supported_color_modes?: string[];
    unit_of_measurement?: string;
    device_class?: string;
    id?: string;
  };
  last_changed?: string;
  last_updated?: string;
}

export interface HaStateChangedEvent {
  entity_id: string;
  new_state: HaState | null;
  old_state: HaState | null;
}
