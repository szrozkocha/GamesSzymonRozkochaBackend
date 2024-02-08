import jwt, {GetPublicKeyOrSecret, JwtPayload} from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import express, {Express} from "express";
import helmet from "helmet";
import {createServer} from "http";
import {DefaultEventsMap} from "socket.io/dist/typed-events";
import {Server as SocketServer, Socket} from "socket.io";
import {ServerClient} from "./serverClient";
import {UserMessageIn} from "./userMessage";
import e from "express";

const fetchJwksUri = async (issuer: string): Promise<string> => {
  const response = await fetch(`${issuer}.well-known/openid-configuration`);
  const {jwks_uri} = await response.json();
  return jwks_uri;
};

function getKey(jwksUri: string): GetPublicKeyOrSecret {
  return (header, callback) => {
    const client = jwksClient({jwksUri});
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        return callback(err);
      }

      if (key) {
        if ("publicKey" in key) {
          callback(null, key.publicKey);
          return;
        } else if ("rsaPublicKey" in key) {
          callback(null, key.rsaPublicKey);
          return;
        }
      }

      callback(null, undefined);
    });
  };
}

const verify = async (token: string) => {
  const {iss: issuer} = jwt.decode(token) as JwtPayload;
  if ("https://szymon-rozkocha.eu.auth0.com/" !== issuer) {
    throw new Error(`The issuer ${issuer} is not trusted here!`);
  }

  const jwksUri = await fetchJwksUri(issuer as string);

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey(jwksUri),
      (error, decoded) => {
        if(error) {
          reject(error);
        } else {
          resolve(resolve);
        }
      }
    )
  })
};

export interface SocketData {
  userId: string;
  username: string;
}

interface ServerData {
  type: string;
  ownerId: string;
  data?: any;
}

interface CreateServerMessage {
  type: string;
  data?: any;
}

interface RemoveServerMessage {
  type: string;
}

export class Server {
  private readonly port = 3000;
  private readonly app;
  private readonly server;
  private readonly socketServer: SocketServer;
  private readonly clients: ServerClient[] = [];
  private readonly servers: ServerData[] = [];

  public getServer(type: string, ownerId: string) {
    return this.servers.filter(serverData => type === serverData.type)
      .find(serverData => ownerId === serverData.ownerId);
  }

  constructor() {
    this.app = express();
    this.app.use(helmet());
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      const tokenHeader = req.header('Authorization');
      if (!tokenHeader) return res.status(401).json({ error: 'Access denied. No token' });
      const token = tokenHeader.split(' ')[1];

      const payload = jwt.decode(token);

      verify(token)
        .then(() => {
          req.userId = payload?.sub as string;

          next();
        })
        .catch(reason => res.status(401).json({ error: 'Access denied. Wrong token' }));
    })

    this.server = createServer(this.app);
    this.socketServer = new SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>(this.server, {
      path: "/api/ws/",
    });

    this.socketServer.use((socket, next) => {
      if (socket.handshake.query && socket.handshake.query.token && socket.handshake.query.username){
        socket.data.username = socket.handshake.query.username as string
        const payload = jwt.decode(socket.handshake.query.token as string);
        verify(socket.handshake.query.token as string)
          .then(() => {
            socket.data.userId = payload?.sub as string;
            console.log("Socket authorised!");
            next();
          })
          .catch(reason => next(new Error('Authentication error')));
      }
      else {
        next(new Error('Authentication error'));
      }
    })

    this.socketServer.on('connection', (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>) => {
      console.log(`a user connected ${socket.data.userId} ${socket.data.username}`);
      const userId = socket.data.userId;
      const username = socket.data.username;

      const client = new ServerClient(userId, username, socket);
      this.clients.push(client);
      this.clients.forEach(client => {
        const userId = client.userId;
        client.socket.emit(
          "clients",
          this.clients.filter(client => client.userId !== userId)
            .map(client => client.toInfo())
        );
      });

      socket.on("message", (message: UserMessageIn) => {
        console.log(`Got message from ${userId}: ${JSON.stringify(message)}`)
        let client = this.clients.find(client => client.userId === message.to);

        if(!client) {
          console.log(`message: ${message} can't be delivered, no user`);
          return;
        }
        console.log(`Sending message to ${client.userId}: ${JSON.stringify({ from: userId, type: message.type, data: message.data })}`)
        client.socket.emit("message", { from: userId, type: message.type, data: message.data });
      })

      socket.on("create_server", (message: CreateServerMessage) => {
        const ownerId = userId;
        if(this.getServer(message.type, ownerId)) {
          console.log(`${ownerId} already have server type ${message.type}`);
          return;
        }

        this.servers.push({ownerId: ownerId, type: message.type, data: message.data});
      });

      socket.on("remove_server", (message: RemoveServerMessage) => {
        const ownerId = userId;
        const serverData = this.getServer(message.type, ownerId);
        if(serverData) {
          this.clients.splice(this.servers.indexOf(serverData), 1);
        } else {
          console.log(`${ownerId} already have server type ${message.type}`);
        }

      });

      socket.on('disconnect', reason => {
        this.clients.splice(this.clients.indexOf(client), 1);
        this.clients.forEach(client => {
          const userId = client.userId;
          client.socket.emit(
            "clients",
            this.clients.filter(client => client.userId !== userId)
              .map(client => client.toInfo())
          );
        });
        console.log('a user disconnected', reason);
      })
    });
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`[server]: Server is running at http://localhost:${this.port}`);
    });
  }
}