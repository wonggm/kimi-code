export default {
  // A browser reference: one element or region the agent captured on a page and
  // the user attached to a message. The dialog is the read-only view the web app
  // opens from a reference pill when no live browser session can look the
  // capture up again.
  includeScreenshot: 'Include screenshot with this reference',
  regionScreenshot: 'A screenshot is required for a region',
  capturedAt: 'Captured at {time}',
  screenshotUnavailable: 'The screenshot is currently unavailable.',
  screenshotUploading: 'Uploading the screenshot.',
  screenshotFailed: 'The screenshot is unavailable. Try uploading it again.',
  retryScreenshot: 'Retry screenshot upload',
  group: 'Web pages',
  comment: 'Comment',
  commentPlaceholder: 'Describe a change, or add without a comment',
  save: 'Save',
  noComposer: 'Open a conversation composer first.',
  missing: 'The captured information for this reference is unavailable.',
  stale: 'The original element could not be located. The page may have changed.',
  kind: {
    button: 'Button',
    input: 'Input',
    image: 'Image',
    link: 'Link',
    heading: 'Heading',
    element: 'Element',
    region: 'Region',
  },
} as const;
