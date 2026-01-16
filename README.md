# Facebook Group Inviter Extension

This Chrome extension helps automate the process of inviting people to your Facebook groups by engaging with posts that indicate interest.

## How It Works

The extension scans a group's page for posts with a high number of likes, opens the list of people who liked the post, and sends invitations to them. This allows you to quickly grow your group by targeting users who are already interested in similar content.

## Features

- **Automated Invitations**: Automatically sends group invitations to users who have liked posts.
- **Customizable Settings**: Configure the number of posts to scan, the total number of invites to send, and the delay between actions.
- **Real-time Progress Tracking**: The popup displays the number of invites sent, the current post being processed, and a progress bar.
- **Error Reporting**: If the extension runs into issues (like not finding any posts), it sends an error report to a webhook for debugging.

## How to Use

1.  **Navigate to a Facebook Group**: Open the Facebook group you want to invite members to.
2.  **Open the Extension**: Click the extension's icon in your browser's toolbar.
3.  **Configure Settings (Optional)**: Click the "Settings" button to adjust the invitation parameters to your liking.
4.  **Start the Process**: Click the "Start Inviting" button to begin sending invitations.
5.  **Monitor Progress**: The popup will switch to a running state, showing you the progress in real-time.
6.  **Stop the Process**: You can stop the process at any time by clicking the "Stop" button.

## Settings

- **Number of Posts**: The total number of posts the extension will scan for likes.
- **Total Invites**: The maximum number of invitations to send in a single session.
- **Delay (in seconds)**: The time to wait between actions, which helps avoid being flagged by Facebook.
- **Max Invites per Post**: The maximum number of invitations to send from a single post's like list.
