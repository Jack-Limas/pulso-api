export type BackplaneListener = (channel: string, message: string) => void;

/** Lets API instances exchange events without knowing about each other. */
export interface Backplane {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  onMessage(listener: BackplaneListener): void;
  close(): Promise<void>;
}
