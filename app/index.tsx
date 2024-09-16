import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, Animated, View, Easing, Dimensions, Image, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { AndroidAudioEncoder, AndroidOutputFormat, IOSOutputFormat, Recording } from 'expo-av/build/Audio';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pulse, Swing } from 'react-native-animated-spinkit';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

const { width, height } = Dimensions.get('window');
const circleSize = Math.sqrt(width * width + height * height) * 2;

const THEME_COLOR = '#2980b9';

export default function HomeScreen() {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [appState, setAppState] = useState(0);
  const [recognitionResults, setRecognitionResults] = useState([]);
  const [showAllResults, setShowAllResults] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const circleScale = useRef(new Animated.Value(0)).current;
  const recognitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startPulseAnimation();
    return () => {
      resetApp();
    };
  }, []);

  useEffect(() => {
    if (appState === 1) {
      startCircleAnimation();
    } else {
      circleScale.setValue(0);
    }
  }, [appState]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const startCircleAnimation = () => {
    circleScale.setValue(0);
    Animated.loop(
      Animated.timing(circleScale, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  };

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync({
        isMeteringEnabled: true,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.wav',
          outputFormat: AndroidOutputFormat.DEFAULT,
          audioEncoder: AndroidAudioEncoder.DEFAULT,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.wav',
          outputFormat: IOSOutputFormat.LINEARPCM,
        },
        web: {
          mimeType: 'audio/wav',
          bitsPerSecond: 128000,
        },
      });
      setRecording(recording);
      setAppState(1);
      recordingTimeoutRef.current = setTimeout(async () => {
        await stopRecording(recording);
      }, 5000);
    } catch {}
  }

  async function stopRecording(recording: Recording | null) {
    setAppState(2);
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (uri) {
          const formData = new FormData();
          formData.append('file', {
            uri: uri,
            type: 'audio/wav',
            name: 'audio.wav',
          });
          const response = await fetch('https://msee-api.mse19hn.com/recognize/upload', {
            method: 'POST',
            body: formData,
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          const result = await response.json();
          if (result.job_id && result.token) checkRecognitionResult(result.job_id, result.token);
        }
      }
    } catch {}
    setRecording(null);
    buttonScale.setValue(1);
  }

  const checkRecognitionResult = async (jobId: string, token: string) => {
    const checkResult = async () => {
      try {
        const response = await fetch('https://msee-api.mse19hn.com/recognize/result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ job_id: jobId, token: token }),
        });
        const result = await response.json();
        if (!result.err && result.list_result) {
          if (recognitionIntervalRef.current) {
            clearInterval(recognitionIntervalRef.current);
          }
          setRecognitionResults(result.list_result);
          setAppState(3);
          if (result.list_result[0] && result.list_result[0].mp3url) {
            playSound(result.list_result[0].mp3url);
          }
        }
      } catch {}
    };
    recognitionIntervalRef.current = setInterval(checkResult, 500);
    recognitionTimeoutRef.current = setTimeout(() => {
      if (recognitionIntervalRef.current) clearInterval(recognitionIntervalRef.current);
      if (appState === 2) resetApp();
    }, 5 * 60 * 1000);
  };

  const playSound = useCallback(
    async (mp3url: string) => {
      try {
        await sound?.unloadAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: mp3url },
          { shouldPlay: true, volume: 1.0 },
          (status) => {
            if (status.didJustFinish) setCurrentlyPlaying(null);
          },
          true
        );
        setSound(newSound);
        setCurrentlyPlaying(mp3url);
        await newSound.playAsync();
      } catch (error) {
        setSound(null);
        setCurrentlyPlaying(null);
      }
    },
    [sound]
  );

  const resetApp = async () => {
    try {
      await recording?.stopAndUnloadAsync();
    } catch {}
    setRecording(null);
    try {
      await sound?.unloadAsync();
    } catch {}
    setSound(null);
    setCurrentlyPlaying(null);

    // Clear all timeouts and intervals
    if (recognitionTimeoutRef.current) {
      clearTimeout(recognitionTimeoutRef.current);
      recognitionTimeoutRef.current = null;
    }
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }

    // Clear the recording timeout
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    // Reset all state variables
    setAppState(0);
    setRecognitionResults([]);
    setShowAllResults(false);
    buttonScale.setValue(1);
    circleScale.setValue(0);
    startPulseAnimation();

    // Reset audio mode
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });
    } catch {}
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/^./, (str) => str.toUpperCase()); // Capitalize the first letter
  };

  const renderRecognitionResult = () => {
    if (recognitionResults.length === 0) return null;

    const mainResult: any = recognitionResults[0];

    return (
      <ScrollView contentContainerStyle={styles.resultContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['rgba(41, 128, 185, 0.8)', 'rgba(41, 128, 185, 0.4)']} style={styles.resultBackground}>
          <Image source={{ uri: mainResult.thumbnailM }} style={styles.thumbnail} />
          <View style={styles.resultContent}>
            <ThemedText style={styles.resultTitle}>{mainResult.title}</ThemedText>
            <ThemedText style={styles.artist}>{mainResult.artistsNames}</ThemedText>
            <ThemedText style={styles.info}>Thể loại: {mainResult.category}</ThemedText>
            <ThemedText style={styles.info}>Thời lượng: {formatDuration(mainResult.duration)}</ThemedText>
            <ThemedText style={styles.info}>Ngày phát hành: {formatDate(mainResult.releaseDate)}</ThemedText>
          </View>
        </LinearGradient>

        {!showAllResults && (
          <TouchableOpacity onPress={() => setShowAllResults(true)} style={styles.moreResultsButton}>
            <ThemedText style={styles.moreResultsText}>Không phải bài hát bạn cần tìm? Xem thêm gợi ý...</ThemedText>
          </TouchableOpacity>
        )}

        {showAllResults && (
          <View style={styles.allResultsContainer}>
            <ThemedText style={styles.allResultsTitle}>Tất cả kết quả nhận diện:</ThemedText>
            {recognitionResults.map((result: any, index) => (
              <TouchableOpacity key={index} style={styles.resultItem} onPress={() => playSound(result.mp3url)}>
                <Image source={{ uri: result.thumbnailM }} style={styles.resultItemThumbnail} />
                <View style={styles.resultItemContent}>
                  <ThemedText style={styles.resultItemTitle}>{result.title}</ThemedText>
                  <ThemedText style={styles.resultItemInfo}>{result.artistsNames}</ThemedText>
                  <ThemedText style={styles.resultItemInfo}>
                    {result.category} - Điểm: {result.score}
                  </ThemedText>
                </View>
                {currentlyPlaying === result.mp3url && <MaterialCommunityIcons name='play-circle' size={24} color={THEME_COLOR} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.newSearchButton} onPress={resetApp}>
          <ThemedText style={styles.newSearchButtonText}>Tìm kiếm bài hát khác</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (appState) {
      case 0:
        return (
          <TouchableOpacity onPress={startRecording}>
            <Animated.View
              style={[
                styles.buttonContainer,
                {
                  transform: [{ scale: Animated.multiply(buttonScale, pulseAnim) }],
                },
              ]}
            >
              <View style={styles.button}>
                <MaterialCommunityIcons name='music' size={60} color='white' />
              </View>
            </Animated.View>
          </TouchableOpacity>
        );
      case 1:
        return (
          <View style={styles.bigIconContainer}>
            <Pulse size={120} color={THEME_COLOR} />
            <ThemedText style={styles.listeningText}>Đang lắng nghe âm nhạc</ThemedText>
            <ThemedText style={styles.subtitleText}>Cố gắng giữ yên lặng để Msee lắng nghe</ThemedText>
          </View>
        );
      case 2:
        return (
          <View style={styles.bigIconContainer}>
            <Swing size={120} color={THEME_COLOR} />
            <ThemedText style={styles.listeningText}>Đang nhận diện bài hát</ThemedText>
            <ThemedText style={styles.subtitleText}>Vui lòng chờ trong giây lát...</ThemedText>
          </View>
        );
      case 3:
        return renderRecognitionResult();
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      {(appState === 1 || appState === 2) && (
        <TouchableOpacity style={styles.resetButton} onPress={resetApp}>
          <MaterialCommunityIcons name='close' size={24} color={THEME_COLOR} />
        </TouchableOpacity>
      )}
      <View style={[styles.content, appState === 3 && styles.contentWithResult]}>
        <ThemedText type='title' style={styles.appTitle}>
          {appState === 0 ? 'Chạm để Msee...' : 'Msee...'}
        </ThemedText>
        {renderContent()}
        {appState === 1 && (
          <Animated.View
            style={[
              styles.circle,
              {
                transform: [{ scale: circleScale }],
                opacity: circleScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 0],
                }),
              },
            ]}
          />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  contentWithResult: {
    marginTop: 60,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: THEME_COLOR,
  },
  buttonContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: THEME_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  circle: {
    position: 'absolute',
    width: circleSize,
    height: circleSize,
    borderRadius: circleSize / 2,
    backgroundColor: THEME_COLOR,
  },
  bigIconContainer: {
    alignItems: 'center',
  },
  listeningText: {
    fontSize: 18,
    marginTop: 20,
    fontWeight: 'bold',
    color: THEME_COLOR,
  },
  subtitleText: {
    fontSize: 14,
    marginTop: 5,
    opacity: 0.7,
    color: THEME_COLOR,
  },
  resultContainer: {
    alignItems: 'center',
    padding: 20,
    paddingBottom: 100,
  },
  resultBackground: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },
  resultContent: {
    alignItems: 'center',
    marginTop: 20,
  },
  thumbnail: {
    width: 200,
    height: 200,
    borderRadius: 100,
    marginBottom: 20,
    borderWidth: 4,
    borderColor: 'white',
  },
  resultTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 'bold',
    marginBottom: 10,
    color: 'white',
    textAlign: 'center',
    fontFamily: 'System',
  },
  artist: {
    fontSize: 18,
    marginBottom: 10,
    color: 'white',
    textAlign: 'center',
  },
  info: {
    fontSize: 14,
    marginBottom: 5,
    color: 'white',
  },
  moreResultsButton: {
    marginTop: 20,
  },
  moreResultsText: {
    fontSize: 14,
    color: THEME_COLOR,
    textDecorationLine: 'underline',
  },
  allResultsContainer: {
    marginTop: 20,
    width: '100%',
  },
  allResultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: THEME_COLOR,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: 'rgba(41, 128, 185, 0.1)',
    borderRadius: 10,
    padding: 10,
  },
  resultItemThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 10,
  },
  resultItemContent: {
    flex: 1,
  },
  resultItemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME_COLOR,
  },
  resultItemInfo: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.7)',
  },
  newSearchButton: {
    backgroundColor: THEME_COLOR,
    padding: 10,
    borderRadius: 5,
    marginTop: 20,
  },
  newSearchButtonText: {
    color: 'white',
    fontSize: 16,
  },
  resetButton: {
    position: 'absolute',
    top: 80,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
});
