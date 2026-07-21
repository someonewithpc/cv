import { useCallback } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { v4 as uuidv4 } from 'uuid';

import { addMarker, groupedUndo, scaleMarker, setSpaceMarker, useAppDispatch } from '@/store';
import type { SpaceType } from '@/store';

export function MarkerUploader({ space, onUploadComplete }: { space: SpaceType, onUploadComplete: () => void }) {
  const dispatch = useAppDispatch();

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const uploadedFiles = [...e.target.files];

    if (uploadedFiles.some((f) => f.type !== 'image/svg+xml')) {
      return;
    }

    uploadedFiles.forEach((file) => {
      const fileReader = new FileReader();
      fileReader.onload = (e) => {
        const { result } = e.target!;
        if (!result) return;

        new Promise<number>((resolve) => {
          // To keep aspect ratio for new uploaded markers, we need to determine their original width and height
          const image = new Image();
          image.onload = (i) => {
            const target = i.target as HTMLImageElement | null;

            if (!target) {
              resolve(1);
              return;
            }

            // Calculate new image aspect ratio
            resolve(target.width / target.height);
          };

          image.onerror = () => {
            resolve(1);
          };

          image.src = result.toString();
        }).then((aspectRatio: number) => {
          const id = uuidv4();
          groupedUndo.batch(() => {
            dispatch(addMarker({
              id,
              source: result.toString(),
              kind: 'upload',
              filename: file.name,
            }));

            // If it's not almost exactly 1
            if (Math.abs(1 - aspectRatio) > 1e-3) {
              dispatch(scaleMarker({ id, scale: [aspectRatio, 1] }));
            }

            dispatch(setSpaceMarker({ spaceId: space.id, markerId: id }));
          });

          onUploadComplete();
        });
      };
      fileReader.readAsDataURL(file);
    });
  }, [dispatch, space.id, onUploadComplete]);

  return (
    <li
      role='option'
      aria-selected={false}
      title="Upload marker"
      className="marker-uploader"
    >
      <label>
        <FontAwesomeIcon icon={faUpload} size="3x" color="white" />
        <input
          type="file"
          accept="image/svg+xml"
          onChange={handleFileChange}
          style={{ position: 'absolute', visibility: 'hidden' }}
        />
      </label>
    </li>
  );
}
