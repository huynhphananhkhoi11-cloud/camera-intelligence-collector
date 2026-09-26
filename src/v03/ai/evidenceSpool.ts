import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  writeFile
} from "node:fs/promises";

import {
  basename,
  dirname,
  join
} from "node:path";

import type {
  EvidencePacket,
  VisualEvidence
} from "./evidenceTypes.js";


const GIB =
  1024 *
  1024 *
  1024;


const MIB =
  1024 *
  1024;


export interface EvidenceSpoolOptions {
  readonly rootDir:
    string;

  readonly maxQuotaBytes?:
    number;

  readonly freeDiskFraction?:
    number;
}


export interface SpoolUsage {
  readonly usedBytes:
    number;

  readonly freeDiskBytes:
    number;

  readonly quotaBytes:
    number;

  readonly remainingQuotaBytes:
    number;
}


export interface SpooledPacketRef {
  readonly packetId:
    string;

  readonly packetPath:
    string;

  readonly boardPath:
    string |
    null;
}


interface SerializedPacket {
  readonly packet:
    Omit<
      EvidencePacket,
      "evidenceBoard"
    >;

  readonly board?:
    {
      readonly imageId:
        string;

      readonly kind:
        VisualEvidence["kind"];

      readonly mimeType:
        VisualEvidence["mimeType"];

      readonly width:
        number;

      readonly height:
        number;

      readonly fileName:
        string;
    };
}


export class SpoolQuotaExceededError
extends Error {

  constructor(
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "SpoolQuotaExceededError";
  }
}


async function directoryBytes(
  root:
    string
): Promise<number> {

  let entries;


  try {
    entries =
      await readdir(
        root,
        {
          withFileTypes:
            true
        }
      );
  }
  catch {
    return 0;
  }


  let total =
    0;


  for (
    const entry
    of entries
  ) {

    const target =
      join(
        root,
        entry.name
      );


    if (
      entry.isDirectory()
    ) {
      total +=
        await directoryBytes(
          target
        );
    }
    else if (
      entry.isFile()
    ) {
      total +=
        (
          await stat(
            target
          )
        ).size;
    }
  }


  return total;
}


function boardExtension(
  mimeType:
    VisualEvidence["mimeType"]
): string {

  if (
    mimeType ===
      "image/webp"
  ) {
    return ".webp";
  }


  if (
    mimeType ===
      "image/jpeg"
  ) {
    return ".jpg";
  }


  return ".png";
}


export class EvidenceSpool {
  readonly rootDir:
    string;


  readonly pendingDir:
    string;


  readonly reviewDir:
    string;


  private readonly maxQuotaBytes:
    number;


  private readonly freeDiskFraction:
    number;


  constructor(
    options:
      EvidenceSpoolOptions
  ) {

    this.rootDir =
      options.rootDir;


    this.pendingDir =
      join(
        this.rootDir,
        "pending"
      );


    this.reviewDir =
      join(
        this.rootDir,
        "review"
      );


    this.maxQuotaBytes =
      options.maxQuotaBytes ??
      2 *
      GIB;


    this.freeDiskFraction =
      options.freeDiskFraction ??
      0.10;
  }


  async init():
    Promise<void> {

    await mkdir(
      this.pendingDir,
      {
        recursive:
          true
      }
    );


    await mkdir(
      this.reviewDir,
      {
        recursive:
          true
      }
    );
  }


  async usage():
    Promise<SpoolUsage> {

    await this.init();


    const fileSystem =
      await statfs(
        this.rootDir
      );


    const freeDiskBytes =
      Number(
        fileSystem.bavail
      ) *
      Number(
        fileSystem.bsize
      );


    const quotaBytes =
      Math.max(
        64 *
        MIB,
        Math.min(
          this.maxQuotaBytes,
          Math.floor(
            freeDiskBytes *
            this.freeDiskFraction
          )
        )
      );


    const usedBytes =
      await directoryBytes(
        this.rootDir
      );


    return {
      usedBytes,
      freeDiskBytes,
      quotaBytes,
      remainingQuotaBytes:
        Math.max(
          0,
          quotaBytes -
          usedBytes
        )
    };
  }


  async assertCapacity(
    incomingBytes:
      number
  ):
    Promise<void> {

    const usage =
      await this.usage();


    if (
      incomingBytes >
        usage.remainingQuotaBytes
    ) {
      throw new SpoolQuotaExceededError(
        [
          "Evidence spool quota reached.",
          "used=" +
            usage.usedBytes,
          "quota=" +
            usage.quotaBytes,
          "freeDisk=" +
            usage.freeDiskBytes
        ].join(
          " "
        )
      );
    }
  }


  async writePacket(
    packet:
      EvidencePacket
  ):
    Promise<
      SpooledPacketRef
    > {

    await this.init();


    const board =
      packet.evidenceBoard;


    const boardFileName =
      board
        ? packet.packetId +
          boardExtension(
            board.mimeType
          )
        : null;


    const packetPath =
      join(
        this.pendingDir,
        packet.packetId +
        ".json"
      );


    const boardPath =
      boardFileName
        ? join(
            this.pendingDir,
            boardFileName
          )
        : null;


    const {
      evidenceBoard:
        _evidenceBoard,
      ...packetWithoutBoard
    } =
      packet;


    const serialized:
      SerializedPacket = {
      packet:
        packetWithoutBoard,

      board:
        board &&
        boardFileName
          ? {
              imageId:
                board.imageId,

              kind:
                board.kind,

              mimeType:
                board.mimeType,

              width:
                board.width,

              height:
                board.height,

              fileName:
                boardFileName
            }
          : undefined
    };


    const json =
      JSON.stringify(
        serialized
      );


    const boardBuffer =
      board
        ? Buffer.from(
            board.base64,
            "base64"
          )
        : Buffer.alloc(
            0
          );


    await this.assertCapacity(
      Buffer.byteLength(
        json,
        "utf8"
      ) +
      boardBuffer.length
    );


    await writeFile(
      packetPath,
      json,
      "utf8"
    );


    if (
      boardPath
    ) {
      await writeFile(
        boardPath,
        boardBuffer
      );
    }


    return {
      packetId:
        packet.packetId,

      packetPath,

      boardPath
    };
  }


  async readPacket(
    reference:
      SpooledPacketRef
  ):
    Promise<
      EvidencePacket
    > {

    const serialized =
      JSON.parse(
        await readFile(
          reference.packetPath,
          "utf8"
        )
      ) as
        SerializedPacket;


    let evidenceBoard:
      VisualEvidence |
      undefined;


    if (
      serialized.board &&
      reference.boardPath
    ) {

      const board =
        await readFile(
          reference.boardPath
        );


      evidenceBoard = {
        imageId:
          serialized.board.imageId,

        kind:
          serialized.board.kind,

        mimeType:
          serialized.board.mimeType,

        width:
          serialized.board.width,

        height:
          serialized.board.height,

        base64:
          board.toString(
            "base64"
          )
      };
    }


    return {
      ...serialized.packet,

      evidenceBoard
    };
  }


  async delete(
    reference:
      SpooledPacketRef
  ):
    Promise<void> {

    await rm(
      reference.packetPath,
      {
        force:
          true
      }
    );


    if (
      reference.boardPath
    ) {
      await rm(
        reference.boardPath,
        {
          force:
            true
        }
      );
    }
  }


  async retainForReview(
    reference:
      SpooledPacketRef
  ):
    Promise<
      SpooledPacketRef
    > {

    await this.init();


    const packetPath =
      join(
        this.reviewDir,
        basename(
          reference.packetPath
        )
      );


    await rename(
      reference.packetPath,
      packetPath
    );


    let boardPath:
      string |
      null =
        null;


    if (
      reference.boardPath
    ) {

      boardPath =
        join(
          this.reviewDir,
          basename(
            reference.boardPath
          )
        );


      await rename(
        reference.boardPath,
        boardPath
      );
    }


    return {
      packetId:
        reference.packetId,

      packetPath,

      boardPath
    };
  }


  async cleanupAll():
    Promise<void> {

    await rm(
      this.rootDir,
      {
        recursive:
          true,

        force:
          true,

        maxRetries:
          4,

        retryDelay:
          250
      }
    );
  }
}
