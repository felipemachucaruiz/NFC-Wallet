import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { useTicketPdfUrl } from "./useEventsApi";

const PDF_DIR = `${FileSystem.documentDirectory}ticket-pdfs/`;

function localPath(ticketId: string): string {
  return `${PDF_DIR}${ticketId}.pdf`;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PDF_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PDF_DIR, { intermediates: true });
  }
}

export interface OfflinePdfState {
  localUri: string | null;
  isDownloading: boolean;
  isAvailableOffline: boolean;
  download: () => Promise<void>;
  open: () => Promise<void>;
}

export function useOfflinePdf(ticketId: string | undefined): OfflinePdfState {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: pdfData } = useTicketPdfUrl(ticketId);
  const remoteUrl = pdfData?.url;

  // Check for existing cached file on mount
  useEffect(() => {
    if (!ticketId) return;
    FileSystem.getInfoAsync(localPath(ticketId)).then((info) => {
      if (info.exists) setLocalUri(info.uri);
    });
  }, [ticketId]);

  // Auto-download when remote URL is available and no local cache yet
  useEffect(() => {
    if (!remoteUrl || !ticketId || localUri || isDownloading) return;
    void download();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteUrl, ticketId, localUri]);

  const download = useCallback(async () => {
    if (!remoteUrl || !ticketId) return;
    setIsDownloading(true);
    try {
      await ensureDir();
      const dest = localPath(ticketId);
      const result = await FileSystem.downloadAsync(remoteUrl, dest);
      if (result.status === 200) {
        setLocalUri(result.uri);
      }
    } finally {
      setIsDownloading(false);
    }
  }, [remoteUrl, ticketId]);

  const open = useCallback(async () => {
    const uri = localUri;
    if (!uri) return;
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    }
  }, [localUri]);

  return {
    localUri,
    isDownloading,
    isAvailableOffline: !!localUri,
    download,
    open,
  };
}
