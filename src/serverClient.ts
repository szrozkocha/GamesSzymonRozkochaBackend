import {Socket} from "socket.io";
import {DefaultEventsMap} from "socket.io/dist/typed-events";
import {SocketData} from "./server";

export class ServerClient {
  userId: string;
  username: string;
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

  constructor(userId: string, username: string, socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>) {
    this.userId = userId;
    this.username = username;
    this.socket = socket;
  }

  public toInfo() {
    return {
      userId: this.userId,
      username: this.username
    }
  }
}