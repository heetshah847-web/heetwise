import { useEffect, useRef } from 'react';
import { getPusher } from '../lib/pusherClient.js';

// Subscribe to `channelName` and bind an { eventName: handler } map for as long
// as the component is mounted (and the channel name is unchanged). No-ops when
// `channelName` is falsy or Pusher isn't configured.
//
// Handlers are stored in a ref so a parent re-render (new inline handler
// objects) doesn't tear down and rebuild the subscription every render.
export function usePusher(channelName, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!channelName) return undefined;
    const pusher = getPusher();
    if (!pusher) return undefined;

    const channel = pusher.subscribe(channelName);
    const bound = {};
    for (const eventName of Object.keys(handlersRef.current || {})) {
      const fn = (data) => handlersRef.current[eventName]?.(data);
      channel.bind(eventName, fn);
      bound[eventName] = fn;
    }

    return () => {
      for (const eventName of Object.keys(bound)) {
        channel.unbind(eventName, bound[eventName]);
      }
      pusher.unsubscribe(channelName);
    };
  }, [channelName]);
}
