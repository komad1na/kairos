/**
 * Human-readable diagnostics for the preview's media elements: error text and
 * ready/network state names used in status messages and logs.
 */

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function shortSrc(src: string): string {
  if (src.startsWith("data:")) return `${src.slice(0, 48)}...`;
  return src;
}

export function mediaState(el: HTMLMediaElement): string {
  return `ready=${readyStateName(el.readyState)}, network=${networkStateName(el.networkState)}, src=${el.currentSrc || el.src}`;
}

function readyStateName(value: number): string {
  switch (value) {
    case HTMLMediaElement.HAVE_NOTHING:
      return "HAVE_NOTHING";
    case HTMLMediaElement.HAVE_METADATA:
      return "HAVE_METADATA";
    case HTMLMediaElement.HAVE_CURRENT_DATA:
      return "HAVE_CURRENT_DATA";
    case HTMLMediaElement.HAVE_FUTURE_DATA:
      return "HAVE_FUTURE_DATA";
    case HTMLMediaElement.HAVE_ENOUGH_DATA:
      return "HAVE_ENOUGH_DATA";
    default:
      return String(value);
  }
}

function networkStateName(value: number): string {
  switch (value) {
    case HTMLMediaElement.NETWORK_EMPTY:
      return "NETWORK_EMPTY";
    case HTMLMediaElement.NETWORK_IDLE:
      return "NETWORK_IDLE";
    case HTMLMediaElement.NETWORK_LOADING:
      return "NETWORK_LOADING";
    case HTMLMediaElement.NETWORK_NO_SOURCE:
      return "NETWORK_NO_SOURCE";
    default:
      return String(value);
  }
}

export function mediaErrorDescription(error: MediaError | null): string {
  if (!error) return "native media error";
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "native media load aborted";
    case MediaError.MEDIA_ERR_NETWORK:
      return "native media/network error";
    case MediaError.MEDIA_ERR_DECODE:
      return "native decoder failed";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "source/codec is not supported by the native webview";
    default:
      return error.message || `native media error ${error.code}`;
  }
}
