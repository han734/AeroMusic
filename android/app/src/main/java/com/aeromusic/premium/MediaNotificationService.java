package com.aeromusic.premium;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.AsyncTask;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MediaNotificationService extends Service implements
        MediaPlayer.OnPreparedListener,
        MediaPlayer.OnCompletionListener,
        MediaPlayer.OnErrorListener,
        MediaPlayer.OnSeekCompleteListener {

    public static final String CHANNEL_ID       = "aeromusic_playback";
    public static final String ACTION_PLAY       = "com.aeromusic.premium.ACTION_PLAY";
    public static final String ACTION_PAUSE      = "com.aeromusic.premium.ACTION_PAUSE";
    public static final String ACTION_NEXT       = "com.aeromusic.premium.ACTION_NEXT";
    public static final String ACTION_PREV       = "com.aeromusic.premium.ACTION_PREV";
    public static final String ACTION_UPDATE     = "com.aeromusic.premium.ACTION_UPDATE";
    public static final String ACTION_STOP       = "com.aeromusic.premium.ACTION_STOP";
    public static final String BROADCAST_ACTION  = "com.aeromusic.premium.MEDIA_ACTION";

    public static final int NOTIFICATION_ID = 7001;

    private MediaSessionCompat mediaSession;
    private NotificationManager notificationManager;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;

    // Native MediaPlayer for background play
    private MediaPlayer mediaPlayer;
    private String currentUrl = "";
    private boolean isPrepared = false;
    private int startPositionMs = 0;

    // Handler for progress updates
    private final Handler progressHandler = new Handler();
    private final Runnable progressUpdater = new Runnable() {
        @Override
        public void run() {
            if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                int current = mediaPlayer.getCurrentPosition();
                int duration = mediaPlayer.getDuration();
                broadcastTimeUpdate(current / 1000.0, duration / 1000.0);
            }
            progressHandler.postDelayed(this, 500);
        }
    };

    // Last known metadata/playback state for redraw
    private String  lastTitle     = "";
    private String  lastArtist    = "";
    private String  lastArtwork   = "";
    private boolean lastIsPlaying = false;
    private Bitmap  lastBitmap    = null;

    // -------------------------------------------------------------------------

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);

        // MediaSessionCompat setup
        mediaSession = new MediaSessionCompat(this, "AeroMusicSession");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                playMediaPlayer();
                broadcastAction("play");
            }
            @Override
            public void onPause() {
                pauseMediaPlayer();
                broadcastAction("pause");
            }
            @Override
            public void onSkipToNext() {
                broadcastAction("next");
            }
            @Override
            public void onSkipToPrevious() {
                broadcastAction("prev");
            }
            @Override
            public void onSeekTo(long pos) {
                if (mediaPlayer != null) {
                    mediaPlayer.seekTo((int) pos);
                }
            }
        });
        mediaSession.setActive(true);

        // Initialize Native MediaPlayer
        initMediaPlayer();

        // Start progress updates loop
        progressHandler.post(progressUpdater);
    }

    private void initMediaPlayer() {
        if (mediaPlayer != null) {
            mediaPlayer.release();
        }
        mediaPlayer = new MediaPlayer();
        mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
        mediaPlayer.setOnPreparedListener(this);
        mediaPlayer.setOnCompletionListener(this);
        mediaPlayer.setOnErrorListener(this);
        mediaPlayer.setOnSeekCompleteListener(this);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
        } else {
            mediaPlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();
        if (action == null) action = ACTION_UPDATE;

        switch (action) {
            case ACTION_PLAY:
                playMediaPlayer();
                broadcastAction("play");
                return START_STICKY;
            case ACTION_PAUSE:
                pauseMediaPlayer();
                broadcastAction("pause");
                return START_STICKY;
            case ACTION_NEXT:
                broadcastAction("next");
                return START_STICKY;
            case ACTION_PREV:
                broadcastAction("prev");
                return START_STICKY;
            case ACTION_STOP:
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            default: break; // ACTION_UPDATE
        }

        lastTitle     = intent.getStringExtra("title");   if (lastTitle   == null) lastTitle   = "AeroMusic";
        lastArtist    = intent.getStringExtra("artist");  if (lastArtist  == null) lastArtist  = "";
        lastArtwork   = intent.getStringExtra("artwork"); if (lastArtwork == null) lastArtwork = "";
        lastIsPlaying = intent.getBooleanExtra("isPlaying", false);

        String url = intent.getStringExtra("url");
        int seekToMs = intent.getIntExtra("seekTo", -1);

        // Handle URL change / play start
        if (url != null && !url.isEmpty() && !url.equals(currentUrl)) {
            currentUrl = url;
            isPrepared = false;
            startPositionMs = Math.max(seekToMs, 0);
            try {
                mediaPlayer.reset();
                mediaPlayer.setDataSource(url);
                mediaPlayer.prepareAsync();
            } catch (Exception e) {
                android.util.Log.e("AeroMusicService", "Error setting data source: " + e.getMessage());
            }
        } else {
            // Handle simple play/pause update
            if (isPrepared) {
                if (lastIsPlaying) {
                    playMediaPlayer();
                } else {
                    pauseMediaPlayer();
                }
            }

            // Handle seek request on currently playing track
            if (seekToMs >= 0 && isPrepared) {
                mediaPlayer.seekTo(seekToMs);
            }
        }

        requestAudioFocus();
        updateMediaSession();
        showNotification(lastBitmap);

        // Load artwork asynchronously and redraw when ready
        if (!lastArtwork.isEmpty()) {
            new ArtworkLoader().execute(lastArtwork);
        }

        return START_STICKY;
    }

    // MediaPlayer callbacks
    @Override
    public void onPrepared(MediaPlayer mp) {
        isPrepared = true;
        if (startPositionMs > 0) {
            mp.seekTo(startPositionMs);
            startPositionMs = 0;
        } else {
            if (lastIsPlaying) {
                playMediaPlayer();
            }
        }
        broadcastAction("prepared");
        updateMediaSession();
    }

    @Override
    public void onCompletion(MediaPlayer mp) {
        lastIsPlaying = false;
        updateMediaSession();
        showNotification(lastBitmap);
        broadcastAction("ended");
    }

    @Override
    public boolean onError(MediaPlayer mp, int what, int extra) {
        android.util.Log.e("AeroMusicService", "MediaPlayer error: " + what + ", " + extra);
        // Reset player on severe errors
        initMediaPlayer();
        isPrepared = false;
        broadcastAction("error");
        return true;
    }

    @Override
    public void onSeekComplete(MediaPlayer mp) {
        updateMediaSession();
    }

    private void playMediaPlayer() {
        if (mediaPlayer != null && isPrepared && !mediaPlayer.isPlaying()) {
            mediaPlayer.start();
            lastIsPlaying = true;
            updateMediaSession();
            showNotification(lastBitmap);
        }
    }

    private void pauseMediaPlayer() {
        if (mediaPlayer != null && isPrepared && mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            lastIsPlaying = false;
            updateMediaSession();
            showNotification(lastBitmap);
        }
    }

    // -------------------------------------------------------------------------

    private void updateMediaSession() {
        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE,  lastTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, lastArtist)
                .build();
        mediaSession.setMetadata(metadata);

        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO;

        int currentPos = (mediaPlayer != null && isPrepared) ? mediaPlayer.getCurrentPosition() : 0;

        PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(
                        lastIsPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        currentPos, 1.0f)
                .build();
        mediaSession.setPlaybackState(state);
    }

    private void showNotification(Bitmap artwork) {
        PendingIntent openApp = PendingIntent.getActivity(
                this, 0,
                new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Action prevAction = new NotificationCompat.Action(
                android.R.drawable.ic_media_previous, "Previous",
                makeServicePendingIntent(ACTION_PREV, 0));

        int ppIcon   = lastIsPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String ppAct = lastIsPlaying ? ACTION_PAUSE : ACTION_PLAY;
        NotificationCompat.Action playPauseAction = new NotificationCompat.Action(
                ppIcon, lastIsPlaying ? "Pause" : "Play",
                makeServicePendingIntent(ppAct, 1));

        NotificationCompat.Action nextAction = new NotificationCompat.Action(
                android.R.drawable.ic_media_next, "Next",
                makeServicePendingIntent(ACTION_NEXT, 2));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(lastTitle)
                .setContentText(lastArtist)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(openApp)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(prevAction)
                .addAction(playPauseAction)
                .addAction(nextAction)
                .setStyle(new MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));

        if (artwork != null) {
            builder.setLargeIcon(artwork);
        }

        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent makeServicePendingIntent(String action, int requestCode) {
        Intent i = new Intent(this, MediaNotificationService.class);
        i.setAction(action);
        return PendingIntent.getService(
                this, requestCode, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "AeroMusic Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Now Playing controls");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            notificationManager.createNotificationChannel(ch);
        }
    }

    private void requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(aa)
                    .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            //noinspection deprecation
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    private void broadcastAction(String action) {
        Intent i = new Intent(BROADCAST_ACTION);
        i.putExtra("action", action);
        sendBroadcast(i);
    }

    private void broadcastTimeUpdate(double currentTime, double duration) {
        Intent i = new Intent(BROADCAST_ACTION);
        i.putExtra("action", "timeUpdate");
        i.putExtra("currentTime", currentTime);
        i.putExtra("duration", duration);
        sendBroadcast(i);
    }

    // -------------------------------------------------------------------------

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        progressHandler.removeCallbacks(progressUpdater);
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        super.onDestroy();
    }

    // -------------------------------------------------------------------------
    // Load album artwork from URL on a background thread

    @SuppressWarnings("deprecation")
    private class ArtworkLoader extends AsyncTask<String, Void, Bitmap> {
        @Override
        protected Bitmap doInBackground(String... urls) {
            try {
                URL url = new URL(urls[0]);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(8000);
                conn.setDoInput(true);
                conn.connect();
                InputStream is = conn.getInputStream();
                Bitmap bmp = BitmapFactory.decodeStream(is);
                is.close();
                return bmp;
            } catch (Exception e) {
                return null;
            }
        }

        @Override
        protected void onPostExecute(Bitmap bmp) {
            if (bmp != null) {
                lastBitmap = bmp;
                updateMediaSession();
                showNotification(lastBitmap);
            }
        }
    }
}
