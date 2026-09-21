import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function ConceptAnimation({src, poster, title, children}) {
  const videoUrl = useBaseUrl(src);
  const posterUrl = useBaseUrl(poster);

  return (
    <figure className="conceptAnimation">
      <video controls playsInline preload="metadata" poster={posterUrl} aria-label={title}>
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support embedded MP4 video.
      </video>
      {children ? <figcaption>{children}</figcaption> : null}
    </figure>
  );
}
