export enum AVStatus {
    Playing = "PLAYING",
    Pause = "PAUSE",
    Standby = "STANDBY"
}

export enum AVInput {
    Bluetooth = "BLUETOOTH",
    AirPlay = "AIRPLAY",
    Spotify = "SPOTIFY",
    Other = "OTHER"
}

export interface AVMedia {
    artist: string;
    album: string;
    title: string;
}

export interface AVStatusMessage {
    status: AVStatus;
    media: AVMedia;
    input: AVInput;
}