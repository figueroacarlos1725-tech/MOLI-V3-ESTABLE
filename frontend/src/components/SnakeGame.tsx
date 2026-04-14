import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GRID = 15;
const CELL = Math.floor((Dimensions.get('window').width - 48) / GRID);
const TICK = 180;

type Point = { x: number; y: number };
type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export default function SnakeGame({ onClose }: { onClose: () => void }) {
  const [snake, setSnake] = useState<Point[]>([{ x: 7, y: 7 }]);
  const [food, setFood] = useState<Point>({ x: 3, y: 3 });
  const [dir, setDir] = useState<Dir>('RIGHT');
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const dirRef = useRef<Dir>('RIGHT');
  const intervalRef = useRef<any>(null);

  const randomFood = useCallback((s: Point[]): Point => {
    let p: Point;
    do { p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }; }
    while (s.some(seg => seg.x === p.x && seg.y === p.y));
    return p;
  }, []);

  const tick = useCallback(() => {
    setSnake(prev => {
      const head = { ...prev[0] };
      const d = dirRef.current;
      if (d === 'UP') head.y--;
      else if (d === 'DOWN') head.y++;
      else if (d === 'LEFT') head.x--;
      else head.x++;

      if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID || prev.some(s => s.x === head.x && s.y === head.y)) {
        setGameOver(true);
        return prev;
      }

      const newSnake = [head, ...prev];
      setFood(f => {
        if (head.x === f.x && head.y === f.y) {
          setScore(sc => sc + 10);
          const nf = randomFood(newSnake);
          setFood(nf);
          return nf;
        }
        newSnake.pop();
        return f;
      });
      return newSnake;
    });
  }, [randomFood]);

  useEffect(() => {
    if (started && !gameOver) {
      intervalRef.current = setInterval(tick, TICK);
      return () => clearInterval(intervalRef.current);
    }
  }, [started, gameOver, tick]);

  useEffect(() => { if (gameOver && intervalRef.current) clearInterval(intervalRef.current); }, [gameOver]);

  const changeDir = (d: Dir) => {
    const opp: Record<Dir, Dir> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    if (d !== opp[dirRef.current]) { dirRef.current = d; setDir(d); }
  };

  const restart = () => {
    setSnake([{ x: 7, y: 7 }]);
    setFood({ x: 3, y: 3 });
    dirRef.current = 'RIGHT';
    setDir('RIGHT');
    setScore(0);
    setGameOver(false);
    setStarted(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.scoreText}>Puntos: {score}</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#636366" />
        </TouchableOpacity>
      </View>

      <View style={[styles.grid, { width: CELL * GRID, height: CELL * GRID }]}>
        {snake.map((s, i) => (
          <View key={i} style={[styles.cell, styles.snake, i === 0 && styles.head, { left: s.x * CELL, top: s.y * CELL, width: CELL - 1, height: CELL - 1 }]} />
        ))}
        <View style={[styles.cell, styles.food, { left: food.x * CELL, top: food.y * CELL, width: CELL - 1, height: CELL - 1 }]} />
      </View>

      {!started ? (
        <TouchableOpacity style={styles.playBtn} onPress={() => setStarted(true)}>
          <Ionicons name="play" size={28} color="#fff" />
          <Text style={styles.playText}>Jugar</Text>
        </TouchableOpacity>
      ) : gameOver ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={styles.gameOverText}>Game Over - {score} pts</Text>
          <TouchableOpacity style={styles.playBtn} onPress={restart}>
            <Text style={styles.playText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.dpad} onPress={() => changeDir('UP')}>
              <Ionicons name="chevron-up" size={28} color="#1C1C1E" />
            </TouchableOpacity>
          </View>
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.dpad} onPress={() => changeDir('LEFT')}>
              <Ionicons name="chevron-back" size={28} color="#1C1C1E" />
            </TouchableOpacity>
            <View style={{ width: 56 }} />
            <TouchableOpacity style={styles.dpad} onPress={() => changeDir('RIGHT')}>
              <Ionicons name="chevron-forward" size={28} color="#1C1C1E" />
            </TouchableOpacity>
          </View>
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.dpad} onPress={() => changeDir('DOWN')}>
              <Ionicons name="chevron-down" size={28} color="#1C1C1E" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 24, marginBottom: 12 },
  scoreText: { fontSize: 16, fontWeight: '700', color: '#00C853' },
  grid: { backgroundColor: '#F8F8F8', borderRadius: 8, borderWidth: 1, borderColor: '#E5E5EA', overflow: 'hidden', position: 'relative' },
  cell: { position: 'absolute', borderRadius: 2 },
  snake: { backgroundColor: '#00C853' },
  head: { backgroundColor: '#00A843', borderRadius: 4 },
  food: { backgroundColor: '#FF3B30', borderRadius: 99 },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#00C853', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 16 },
  playText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  gameOverText: { fontSize: 18, fontWeight: '800', color: '#FF3B30', marginTop: 12 },
  controls: { marginTop: 16, alignItems: 'center' },
  controlRow: { flexDirection: 'row', justifyContent: 'center' },
  dpad: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center', margin: 3 },
});
