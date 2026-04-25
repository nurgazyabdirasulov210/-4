import 'dart:io';
import 'контрольная-1.dart';

class Viktorina {
  int ochki = 0;
  
  List<Vopros> spisok = [
    ObichniyVopros('ты человек?', ['да', 'нет', 'незнаю'], 0, Slozhnost.legkiy),
    DaNetVopros('2+2=4?', true, Slozhnost.legkiy),
    ObichniyVopros('сколько будет 2 + 2', ['1', '4', '11111111'], 1, Slozhnost.slozhniy),
  ];

  void nachalo() {
    print('Как тебя зовут?');
    String? imya = stdin.readLineSync();
    print('Привет, $imya! Давай начнем. Если надоест, напиши 0.');

    for (int i = 0; i < spisok.length; i++) {
      var tekushiyVopros = spisok[i];
      
      tekushiyVopros.pokaziVopros(); 
      
      stdout.write('и какой ответ?: ');
      String? vvod = stdin.readLineSync();

      if (vvod == '0') {
        print('игра окончена');
        break;
      }

      int? otvetPolzovatelya = int.tryParse(vvod ?? '');

      if (otvetPolzovatelya == null || otvetPolzovatelya < 1 || otvetPolzovatelya > tekushiyVopros.varianti.length) {
        print('неправильно.');
      } else {
        if (tekushiyVopros.proverka(otvetPolzovatelya - 1)) {
          print('правильно +1балл');
          ochki++;
        } else {
          print('непрравильно');
        }
      }
    }

    itog();
  }

  void itog() {
    print('---------------------');
    print('итого: $ochki из ${spisok.length}');
    
    var proverkaRezultata = (int bally) {
      if (bally > 1) return 'Молодец!';
    };

    print(proverkaRezultata(ochki));
    print('Всего вопросов было задано: ${Vopros.vsegoVoprosov} вопроса');
  }
}