declare module 'adm-zip' {
  export class IZipEntry {
    entryName: string;
    name: string;
    isDirectory: boolean;
    getData(): Buffer;
  }

  export default class AdmZip {
    constructor(input?: Buffer | string);
    getEntries(): IZipEntry[];
  }
}