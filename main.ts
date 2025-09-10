import * as net from 'net';

// Interface pour représenter une réponse HTTP
interface HTTPResponse {
    statusLine: string;
    statusCode: number;
    headers: { [key: string]: string };
    body: string;
    rawHeaders: string;
}

// Classe pour parser les réponses HTTP
class HTTPParser {
    public static parseResponse(rawResponse: string): HTTPResponse {
        const lines = rawResponse.split('\r\n');
        const statusLine = lines[0];
        const statusCode = parseInt(statusLine.split(' ')[1]) || 0;
        
        let headerEndIndex = -1;
        const headers: { [key: string]: string } = {};
        
        // Trouver la fin des headers
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '') {
                headerEndIndex = i;
                break;
            }
            
            const colonIndex = lines[i].indexOf(':');
            if (colonIndex > 0) {
                const headerName = lines[i].substring(0, colonIndex).trim().toLowerCase();
                const headerValue = lines[i].substring(colonIndex + 1).trim();
                headers[headerName] = headerValue;
            }
        }
        
        const rawHeaders = lines.slice(0, headerEndIndex + 1).join('\r\n');
        const bodyLines = lines.slice(headerEndIndex + 1);
        const body = bodyLines.join('\r\n');
        
        return {
            statusLine,
            statusCode,
            headers,
            body,
            rawHeaders
        };
    }
    
    public static parseChunkedBody(chunkedData: string): string {
        const lines = chunkedData.split('\r\n');
        let result = '';
        let i = 0;
        
        while (i < lines.length) {
            // Lire la taille du chunk (en hexadécimal)
            const chunkSizeLine = lines[i].trim();
            if (!chunkSizeLine) {
                i++;
                continue;
            }
            
            const chunkSize = parseInt(chunkSizeLine, 16);
            
            // Si la taille est 0, c'est la fin
            if (chunkSize === 0) {
                break;
            }
            
            i++; // Passer à la ligne suivante (données du chunk)
            
            // Collecter les données du chunk
            let chunkData = '';
            let remainingSize = chunkSize;
            
            while (remainingSize > 0 && i < lines.length) {
                const line = lines[i];
                if (chunkData) chunkData += '\r\n';
                chunkData += line;
                remainingSize -= Buffer.from(line + '\r\n', 'utf8').length;
                i++;
            }
            
            result += chunkData;
            i++; // Passer la ligne vide après le chunk
        }
        
        return result;
    }
}

class DockerClient {
    private socket: net.Socket;
    private host: string;

    constructor(host: string = 'localhost') {
        this.host = host;
        this.socket = new net.Socket();
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // Connexion établie
        this.socket.on('connect', () => {
            console.debug(`Connected to ${this.host}`);
        });

        // Données reçues du serveur
        this.socket.on('data', (data: Buffer) => {
            const response = data.toString('utf8');
            this.onDataReceived(response);
        });

        // Connexion fermée
        this.socket.on('close', () => {
            console.debug('Connexion closed');
        });

        // Gestion des erreurs
        this.socket.on('error', (error: Error) => {
            console.error('Error:', error.message);
        });
    }

    // Callback appelé quand des données sont reçues
    private onDataReceived(data: string): void {
        // Cette méthode peut être surchargée ou modifiée selon les besoins
        // Par défaut, elle ne fait rien de plus que le log
    }

    // Méthode pour se connecter au serveur
    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.connect(this.host, () => {
                resolve();
            });

            this.socket.on('error', (error) => {
                reject(error);
            });
        });
    }

    // Méthode pour envoyer une chaîne de caractères
    public sendMessage(message: string): void {
        if (this.socket.destroyed) {
            console.error('Socket closed');
            return;
        }

        this.socket.write(message, 'utf8', (error) => {
            if (error) {
                console.error(error.message);
            } else {
                console.log('Message sent:', message);
            }
        });
    }

    // Méthode pour envoyer un message et attendre la réponse
    public sendMessageAndWaitResponse(message: string, timeout: number = 5000): Promise<string> {
        return new Promise((resolve, reject) => {
            if (this.socket.destroyed) {
                reject(new Error('Socket closed'));
                return;
            }

            let responseReceived = false;
            let timeoutId: NodeJS.Timeout;

            // Handler temporaire pour cette réponse
            const dataHandler = (data: Buffer) => {
                if (!responseReceived) {
                    responseReceived = true;
                    clearTimeout(timeoutId);
                    const response = data.toString('utf8');
                    resolve(response);
                }
            };

            // Timeout pour éviter d'attendre indéfiniment
            timeoutId = setTimeout(() => {
                if (!responseReceived) {
                    responseReceived = true;
                    this.socket.off('data', dataHandler);
                    reject(new Error('Timeout'));
                }
            }, timeout);

            // Écouter les données une seule fois
            this.socket.once('data', dataHandler);

            // Envoyer le message
            this.socket.write(message, 'utf8', (error) => {
                if (error) {
                    responseReceived = true;
                    clearTimeout(timeoutId);
                    this.socket.off('data', dataHandler);
                    reject(error);
                } else {
                    console.log('Message sent:', message);
                }
            });
        });
    }

    // Méthode pour lire une réponse HTTP complète
    public readHTTPResponse(timeout: number = 10000): Promise<HTTPResponse> {
        return new Promise((resolve, reject) => {
            let buffer = '';
            let timeoutId: NodeJS.Timeout;
            let resolved = false;
            let headersComplete = false;
            let expectedBodyLength = -1;
            let isChunked = false;

            const dataHandler = (data: Buffer) => {
                buffer += data.toString('utf8');
                
                if (!headersComplete) {
                    // Vérifier si les headers sont complets
                    const headerEndIndex = buffer.indexOf('\r\n\r\n');
                    if (headerEndIndex !== -1) {
                        headersComplete = true;
                        
                        // Parser les headers pour déterminer le type de réponse
                        const headerPart = buffer.substring(0, headerEndIndex + 4);
                        const tempResponse = HTTPParser.parseResponse(headerPart);
                        
                        // Vérifier le Content-Length
                        if (tempResponse.headers['content-length']) {
                            expectedBodyLength = parseInt(tempResponse.headers['content-length']);
                        }
                        
                        // Vérifier Transfer-Encoding: chunked
                        if (tempResponse.headers['transfer-encoding'] === 'chunked') {
                            isChunked = true;
                        }
                    }
                }
                
                if (headersComplete && !resolved) {
                    let isComplete = false;
                    
                    if (isChunked) {
                        // Pour chunked, chercher la fin (chunk de taille 0)
                        if (buffer.includes('\r\n0\r\n\r\n')) {
                            isComplete = true;
                        }
                    } else if (expectedBodyLength >= 0) {
                        // Pour Content-Length, vérifier si on a assez de données
                        const headerEndIndex = buffer.indexOf('\r\n\r\n');
                        const bodyStartIndex = headerEndIndex + 4;
                        const currentBodyLength = buffer.length - bodyStartIndex;
                        
                        if (currentBodyLength >= expectedBodyLength) {
                            isComplete = true;
                        }
                    } else {
                        // Si pas de Content-Length ni chunked, considérer comme terminé
                        // (pour les réponses courtes ou quand la connexion se ferme)
                        isComplete = true;
                    }
                    
                    if (isComplete) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        this.socket.off('data', dataHandler);
                        
                        let response = HTTPParser.parseResponse(buffer);
                        
                        // Déchunker le body si nécessaire
                        if (isChunked && response.body) {
                            response.body = HTTPParser.parseChunkedBody(response.body);
                        }
                        resolve(response);
                    }
                }
            };

            // Gérer la fermeture de connexion
            const closeHandler = () => {
                if (!resolved && headersComplete) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    this.socket.off('data', dataHandler);
                    
                    let response = HTTPParser.parseResponse(buffer);
                    
                    if (isChunked && response.body) {
                        response.body = HTTPParser.parseChunkedBody(response.body);
                    }
                    
                    console.log('Connexion fermée, réponse HTTP reçue');
                    resolve(response);
                }
            };

            timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.socket.off('data', dataHandler);
                    this.socket.off('close', closeHandler);
                    reject(new Error('Timeout: réponse HTTP incomplète'));
                }
            }, timeout);

            this.socket.on('data', dataHandler);
            this.socket.once('close', closeHandler);
        });
    }

    // Méthode pour envoyer une requête HTTP et lire la réponse
    public sendHTTPRequest(request: string, timeout: number = 10000): Promise<HTTPResponse> {
        return new Promise(async (resolve, reject) => {
            if (this.socket.destroyed) {
                reject(new Error('Socket fermé'));
                return;
            }

            try {
                // Envoyer la requête
                await new Promise<void>((resolveWrite, rejectWrite) => {
                    this.socket.write(request, 'utf8', (error) => {
                        if (error) {
                            rejectWrite(error);
                        } else {
                            resolveWrite();
                        }
                    });
                });

                // Lire la réponse
                const response = await this.readHTTPResponse(timeout);
                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }

    public async get<T>(uri: string): Promise<T> {
        return new Promise(async (resolve, reject) => {
            this.sendHTTPRequest(`GET ${uri} HTTP/1.1
Host: host
User-Agent: docker-ts/0.0.1
Accept: application/json

`).then((response) => {
                const contentType = response.headers['content-type']?.toLowerCase();
                if (contentType?.includes('application/json')) {
                    const parsedBody = JSON.parse(response.body);
                    resolve(parsedBody as T);
                };
                
            });
        });
    }

    // Méthode pour fermer la connexion
    public disconnect(): void {
        this.socket.end();
    }


    // TODO this could be generated by openapi-generator with a custom template

    public async systemVersion(): Promise<SystemVersion> {
        return this.get<SystemVersion>('/version')
    }

    public async networkInspect(id: string): Promise<NetworkInspect> {
        return this.get<NetworkInspect>(`/networks/${id}`)
    }
}


const docker = new DockerClient('/var/run/docker.sock');

try {
        await docker.connect();

        let version = await docker.systemVersion();
        console.log("Version:")
        console.dir(version, { depth: null });

        let network = await docker.networkInspect('d527db895441');
        console.log("Network:")
        console.dir(network, { depth: null });

        docker.disconnect();
} catch (error) {
        console.error(error);
}


// Models generated by openapi-generator

/**
* Response of Engine API: GET \"/version\" 
*/
export class SystemVersion {
    'platform'?: SystemVersionPlatform;
    /**
    * Information about system components 
    */
    'components'?: Array<SystemVersionComponentsInner>;
    /**
    * The version of the daemon
    */
    'version'?: string;
    /**
    * The default (and highest) API version that is supported by the daemon 
    */
    'apiVersion'?: string;
    /**
    * The minimum API version that is supported by the daemon 
    */
    'minAPIVersion'?: string;
    /**
    * The Git commit of the source code that was used to build the daemon 
    */
    'gitCommit'?: string;
    /**
    * The version Go used to compile the daemon, and the version of the Go runtime in use. 
    */
    'goVersion'?: string;
    /**
    * The operating system that the daemon is running on (\"linux\" or \"windows\") 
    */
    'os'?: string;
    /**
    * The architecture that the daemon is running on 
    */
    'arch'?: string;
    /**
    * The kernel version (`uname -r`) that the daemon is running on.  This field is omitted when empty. 
    */
    'kernelVersion'?: string;
    /**
    * Indicates if the daemon is started with experimental features enabled.  This field is omitted when empty / false. 
    */
    'experimental'?: boolean;
    /**
    * The date and time that the daemon was compiled. 
    */
    'buildTime'?: string;
}

export class SystemVersionComponentsInner {
    /**
    * Name of the component 
    */
    'name': string;
    /**
    * Version of the component 
    */
    'version': string;
    /**
    * Key/value pairs of strings with additional information about the component. These values are intended for informational purposes only, and their content is not defined, and not part of the API specification.  These messages can be printed by the client as information to the user. 
    */
    'details'?: any | null;
}

export class SystemVersionPlatform {
    'name': string;
}

export class NetworkInspect {
    /**
    * Contains endpoints attached to the network. 
    */
    'containers'?: { [key: string]: EndpointResource; };
    /**
    * List of services using the network. This field is only present for swarm scope networks, and omitted for local scope networks. 
    */
    'services'?: { [key: string]: any; };
    /**
    * Name of the network. 
    */
    'name'?: string;
    /**
    * ID that uniquely identifies a network on a single machine. 
    */
    'id'?: string;
    /**
    * Date and time at which the network was created in [RFC 3339](https://www.ietf.org/rfc/rfc3339.txt) format with nano-seconds. 
    */
    'created'?: string;
    /**
    * The level at which the network exists (e.g. `swarm` for cluster-wide or `local` for machine level) 
    */
    'scope'?: string;
    /**
    * The name of the driver used to create the network (e.g. `bridge`, `overlay`). 
    */
    'driver'?: string;
    /**
    * Whether the network was created with IPv4 enabled. 
    */
    'enableIPv4'?: boolean;
    /**
    * Whether the network was created with IPv6 enabled. 
    */
    'enableIPv6'?: boolean;
    'IPAM'?: IPAM;
    /**
    * Whether the network is created to only allow internal networking connectivity. 
    */
    'internal'?: boolean;
    /**
    * Whether a global / swarm scope network is manually attachable by regular containers from workers in swarm mode. 
    */
    'attachable'?: boolean;
    /**
    * Whether the network is providing the routing-mesh for the swarm cluster. 
    */
    'ingress'?: boolean;
    'configFrom'?: ConfigReference;
    /**
    * Whether the network is a config-only network. Config-only networks are placeholder networks for network configurations to be used by other networks. Config-only networks cannot be used directly to run containers or services. 
    */
    'configOnly'?: boolean;
    /**
    * Network-specific options uses when creating the network. 
    */
    'options'?: { [key: string]: string; };
    /**
    * Metadata specific to the network being created. 
    */
    'labels'?: { [key: string]: string; };
    /**
    * List of peer nodes for an overlay network. This field is only present for overlay networks, and omitted for other network types. 
    */
    'peers'?: Array<PeerInfo>;
}


export class IPAM {
    /**
    * Name of the IPAM driver to use.
    */
    'driver'?: string;
    /**
    * List of IPAM configuration options, specified as a map:  ``` {\"Subnet\": <CIDR>, \"IPRange\": <CIDR>, \"Gateway\": <IP address>, \"AuxAddress\": <device_name:IP address>} ``` 
    */
    'config'?: Array<IPAMConfig>;
    /**
    * Driver-specific options, specified as a map.
    */
    'options'?: { [key: string]: string; };
}

export class IPAMConfig {
    /** 
     * subnet */
    'subnet'?: string;
    /** 
     * iprange */
    'iPRange'?: string;
    /** 
     * gateway */
    'gateway'?: string;
    /** 
     * aux */
    'auxiliaryAddresses'?: { [key: string]: string; };
}

export class ConfigReference {
    /**
    * The name of the config-only network that provides the network\'s configuration. The specified network must be an existing config-only network. Only network names are allowed, not network IDs. 
    */
    'network'?: string;
}

export class EndpointResource {
    'name'?: string;
    'endpointID'?: string;
    'macAddress'?: string;
    'iPv4Address'?: string;
    'iPv6Address'?: string;
}

export class PeerInfo {
    /**
    * ID of the peer-node in the Swarm cluster.
    */
    'name'?: string;
    /**
    * IP-address of the peer-node in the Swarm cluster.
    */
    'IP'?: string;
}