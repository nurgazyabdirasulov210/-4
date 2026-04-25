enum Slozhnost { legkiy, slozhniy }

abstract class Vopros {
  String _voprosText; 
  List<String> _varianti;
  int _pravilniyOtvet;
  Slozhnost uroven;

  static int vsegoVoprosov = 0;

  Vopros(this._voprosText, this._varianti, this._pravilniyOtvet, this.uroven) {
    vsegoVoprosov++;
  }

  String get voprosText => _voprosText;
  List<String> get varianti => _varianti;

  void pokaziVopros();

  bool proverka(int otvet) {
    return otvet == _pravilniyOtvet;
  }
}

class ObichniyVopros extends Vopros {
  ObichniyVopros(super.vopros, super.varianti, super.pravilno, super.ur);

  @override
  void pokaziVopros() {
    print('\nВопрос: $_voprosText');
    for (int i = 0; i < _varianti.length; i++) {
      print('${i + 1}) ${_varianti[i]}');
    }
  }
}

class DaNetVopros extends Vopros {
  DaNetVopros(String text, bool otvet, Slozhnost ur) 
      : super(text, ['Да', 'Нет'], otvet ? 0 : 1, ur);

  @override
  void pokaziVopros() {
    print('\n[Да или Нет] $_voprosText');
  }
}