export enum UserMessageType {
  TEXT = "TEXT"
}
export interface UserMessageIn {
  to: string;
  type: UserMessageType;
  data: any;
}

export interface UserMessageOut {
  from: string;
  type: UserMessageType;
  data: any;
}